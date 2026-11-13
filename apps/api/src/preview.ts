import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';

/** 预览码有效期。只写在签名里，不落库。 */
export const PREVIEW_TTL_MS = 10 * 60 * 1000;

export interface PreviewPass {
  token: string;
  expiresAt: string;
}

function sign(payload: string): string {
  return createHmac('sha256', env.jwtSecret).update(payload).digest('base64url');
}

/** 签发一张只对这个 code 有效的预览通行证。 */
export function signPreview(code: string, now = Date.now()): PreviewPass {
  const expiresAtMs = now + PREVIEW_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ c: code.trim().toLowerCase(), e: expiresAtMs })).toString('base64url');
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(expiresAtMs).toISOString() };
}

export function verifyPreview(token: string, code: string, now = Date.now()): 'ok' | 'expired' | 'invalid' {
  const dot = token.indexOf('.');
  if (dot <= 0) return 'invalid';
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return 'invalid';
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { c?: unknown; e?: unknown };
    if (body.c !== code.trim().toLowerCase() || typeof body.e !== 'number') return 'invalid';
    return body.e > now ? 'ok' : 'expired';
  } catch {
    return 'invalid';
  }
}
