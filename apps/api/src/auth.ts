import { randomBytes } from 'node:crypto';
import { SignJWT, createRemoteJWKSet, jwtVerify } from 'jose';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { canEdit, type AdminRole, type SessionInfo } from '@tryon/shared';
import { env } from './config.js';
import { badRequest, forbidden, unauthorized } from './errors.js';
import type { UserService } from './services/users.js';

const COOKIE_NAME = 'tryon_session';
const CSRF_COOKIE = 'tryon_csrf';
const SESSION_HOURS = 12;
const encoder = new TextEncoder();
const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

export interface GoogleProfile {
  email: string;
  name: string;
  picture: string;
}

/** Verify a Google Identity Services ID token (free; checks signature, audience, issuer, expiry). */
export async function verifyGoogleCredential(credential: string): Promise<GoogleProfile> {
  if (!env.googleClientId) throw badRequest('服务端未配置 GOOGLE_CLIENT_ID');
  try {
    const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env.googleClientId,
    });
    const email = String(payload.email ?? '').toLowerCase();
    if (!email || payload.email_verified !== true) throw new Error('email not verified');
    return { email, name: String(payload.name ?? ''), picture: String(payload.picture ?? '') };
  } catch {
    throw unauthorized('Google 登录校验失败，请重试');
  }
}

export async function issueSession(reply: FastifyReply, profile: GoogleProfile): Promise<string> {
  const csrf = randomBytes(16).toString('base64url');
  const jwt = await new SignJWT({ name: profile.name, picture: profile.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(profile.email)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(encoder.encode(env.jwtSecret));
  const options = { secure: env.cookieSecure, sameSite: 'lax' as const, path: '/', maxAge: SESSION_HOURS * 3600 };
  reply.setCookie(COOKIE_NAME, jwt, { ...options, httpOnly: true });
  reply.setCookie(CSRF_COOKIE, csrf, { ...options, httpOnly: false });
  return csrf;
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(COOKIE_NAME, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

async function readSession(request: FastifyRequest): Promise<GoogleProfile | null> {
  const token = request.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, encoder.encode(env.jwtSecret));
    if (!payload.sub) return null;
    return { email: payload.sub, name: String(payload.name ?? ''), picture: String(payload.picture ?? '') };
  } catch {
    return null;
  }
}

function assertCsrf(request: FastifyRequest) {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return;
  const header = request.headers['x-csrf-token'];
  const cookie = request.cookies?.[CSRF_COOKIE];
  if (!header || !cookie || header !== cookie) throw forbidden('CSRF 校验失败，请刷新页面');
}

/** Authenticated admin request; the allowlist is re-checked so removals apply immediately. */
export async function requireUser(
  request: FastifyRequest,
  users: UserService,
  need: 'view' | 'edit' | 'admin' = 'view'
): Promise<SessionInfo> {
  assertCsrf(request);
  const session = await readSession(request);
  if (!session) throw unauthorized();
  const resolved = await users.resolve(session.email);
  if (!resolved) throw unauthorized('账号不在白名单中或已停用');
  const role: AdminRole = resolved.role;
  if (need === 'edit' && !canEdit(role)) throw forbidden('只读账号不能修改');
  if (need === 'admin' && role !== 'admin') throw forbidden('仅管理员可操作');
  return {
    email: resolved.email,
    name: resolved.name || session.name,
    picture: session.picture,
    role,
    bootstrap: resolved.bootstrap,
  };
}
