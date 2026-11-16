import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  LIST_DEFAULT_PAGE,
  LIST_DEFAULT_PAGE_SIZE,
  type AuthConfig,
  type FinderStatus,
  type SessionInfo,
} from '@tryon/shared';
import { clearSession, issueSession, requireUser, verifyGoogleCredential, type GoogleProfile } from './auth.js';
import { env } from './config.js';
import { badRequest, notFound, unauthorized } from './errors.js';
import type { EventService } from './services/events.js';
import type { FinderService } from './services/finders.js';
import type { StatsService } from './services/stats.js';
import type { UserService } from './services/users.js';

export interface Services {
  finders: FinderService;
  users: UserService;
  events: EventService;
  stats: StatsService;
}

type IdParams = { Params: { id: string } };

function queryString(request: FastifyRequest, key: string): string {
  const value = (request.query as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value : '';
}

function queryInt(request: FastifyRequest, key: string, fallback: number): number {
  const value = Number(queryString(request, key));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function scanUrl(code: string): string {
  return `${env.publicScanBaseUrl}/s/${encodeURIComponent(code)}`;
}

export async function registerRoutes(app: FastifyInstance, { finders, users, events, stats }: Services) {
  app.get('/api/health', async () => ({ ok: true, storage: env.storage }));

  // ------------------------------------------------------------------ auth

  app.get('/api/auth/config', async (): Promise<AuthConfig> => ({
    googleClientId: env.googleClientId,
    devLogin: env.devLogin,
  }));

  const login = async (reply: Parameters<typeof issueSession>[0], profile: GoogleProfile) => {
    const resolved = await users.resolve(profile.email);
    if (!resolved) throw unauthorized(`${profile.email} 不在后台白名单中，请联系管理员添加`);
    await users.touchName(resolved.email, profile.name);
    const csrf = await issueSession(reply, profile);
    const session: SessionInfo = {
      email: resolved.email,
      name: resolved.name || profile.name,
      picture: profile.picture,
      role: resolved.role,
      bootstrap: resolved.bootstrap,
      brands: resolved.brands,
      scope: resolved.scope,
    };
    return { session, csrf };
  };

  app.post<{ Body: { credential?: string } }>('/api/auth/google', async (request, reply) => {
    const credential = String(request.body?.credential ?? '');
    if (!credential) throw badRequest('缺少 Google 凭证');
    return login(reply, await verifyGoogleCredential(credential));
  });

  app.post<{ Body: { email?: string } }>('/api/auth/dev-login', async (request, reply) => {
    if (!env.devLogin) throw notFound();
    const email = String(request.body?.email ?? '').trim().toLowerCase();
    if (!email) throw badRequest('请输入邮箱');
    return login(reply, { email, name: email.split('@')[0], picture: '' });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async (request) => requireUser(request, users));

  // ------------------------------------------------------------------ finders

  app.get('/api/finders', async (request) => {
    const user = await requireUser(request, users);
    return finders.list(
      {
        page: queryInt(request, 'page', LIST_DEFAULT_PAGE),
        pageSize: queryInt(request, 'pageSize', LIST_DEFAULT_PAGE_SIZE),
        q: queryString(request, 'q'),
        status: queryString(request, 'status'),
        brand: queryString(request, 'brand'),
      },
      user
    );
  });

  app.post<{ Body: { title?: string; brand?: string; code?: string } }>('/api/finders', async (request, reply) => {
    const user = await requireUser(request, users, 'edit');
    const finder = await finders.create(
      { title: request.body?.title ?? '', brand: request.body?.brand ?? '', code: request.body?.code },
      user.email,
      user
    );
    reply.code(201);
    return { finder, codeLocked: false, scanUrl: scanUrl(finder.code) };
  });

  app.get<IdParams>('/api/finders/:id', async (request) => {
    const user = await requireUser(request, users);
    const finder = await finders.get(request.params.id, user);
    return { finder, codeLocked: await finders.codeLocked(finder.id), scanUrl: scanUrl(finder.code) };
  });

  app.put<IdParams>('/api/finders/:id', async (request) => {
    const user = await requireUser(request, users, 'edit');
    const finder = await finders.save(request.params.id, request.body, user.email, user);
    return { finder, codeLocked: await finders.codeLocked(finder.id), scanUrl: scanUrl(finder.code) };
  });

  app.post<IdParams & { Body: { status?: FinderStatus; version?: number } }>(
    '/api/finders/:id/status',
    async (request) => {
      const user = await requireUser(request, users, 'edit');
      const status: FinderStatus = request.body?.status === 'active' ? 'active' : 'disabled';
      const finder = await finders.setStatus(request.params.id, status, Number(request.body?.version), user.email, user);
      return { finder, codeLocked: await finders.codeLocked(finder.id), scanUrl: scanUrl(finder.code) };
    }
  );

  app.delete<IdParams>('/api/finders/:id', async (request) => {
    const user = await requireUser(request, users, 'edit');
    await finders.remove(request.params.id, user.email, user);
    return { ok: true };
  });

  app.post<IdParams>('/api/finders/:id/duplicate', async (request, reply) => {
    const user = await requireUser(request, users, 'edit');
    const finder = await finders.duplicate(request.params.id, user.email, user);
    reply.code(201);
    return { finder, codeLocked: false, scanUrl: scanUrl(finder.code) };
  });

  app.get<IdParams>('/api/finders/:id/versions', async (request) => {
    const user = await requireUser(request, users);
    return { items: await finders.history(request.params.id, user) };
  });

  app.post<IdParams>('/api/finders/:id/preview', async (request) => {
    const user = await requireUser(request, users);
    const issued = await finders.issuePreview(request.params.id, user);
    return {
      url: `${scanUrl(issued.code)}?pv=${encodeURIComponent(issued.token)}`,
      expiresAt: issued.expiresAt,
    };
  });

  app.get<{ Params: { id: string; version: string } }>('/api/finders/:id/versions/:version', async (request) => {
    const user = await requireUser(request, users);
    return { finder: await finders.getVersion(request.params.id, Number(request.params.version), user) };
  });

  app.get<IdParams>('/api/finders/:id/stats', async (request) => {
    const user = await requireUser(request, users);
    const finder = await finders.get(request.params.id, user);
    return stats.forFinder(finder, {
      from: queryString(request, 'from'),
      to: queryString(request, 'to'),
      days: queryString(request, 'days'),
      channel: queryString(request, 'channel'),
    });
  });

  // ------------------------------------------------------------------ admin users

  app.get('/api/admin/users', async (request) => {
    await requireUser(request, users, 'admin');
    return { items: await users.list() };
  });

  app.post<{ Body: Record<string, unknown> }>('/api/admin/users', async (request, reply) => {
    const actor = await requireUser(request, users, 'admin');
    const user = await users.upsert(request.body ?? {}, actor.email, 'create');
    reply.code(201);
    return { user };
  });

  app.put<{ Params: { email: string }; Body: Record<string, unknown> }>(
    '/api/admin/users/:email',
    async (request) => {
      const actor = await requireUser(request, users, 'admin');
      const user = await users.upsert({ ...request.body, email: request.params.email }, actor.email, 'update');
      return { user };
    }
  );

  app.delete<{ Params: { email: string } }>('/api/admin/users/:email', async (request) => {
    const actor = await requireUser(request, users, 'admin');
    await users.remove(request.params.email, actor.email);
    return { ok: true };
  });

  // ------------------------------------------------------------------ public (scan page)

  app.get<{ Params: { code: string } }>(
    '/api/public/finders/:code',
    { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const preview = queryString(request, 'pv');
      if (preview) {
        reply.header('Cache-Control', 'private, no-store');
        return finders.getPreview(request.params.code, preview);
      }
      reply.header('Cache-Control', 'public, max-age=60');
      return finders.getPublic(request.params.code);
    }
  );

  app.post(
    '/api/public/events',
    { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } },
    async (request) => events.ingest(request.body, String(request.headers['user-agent'] ?? ''))
  );
}
