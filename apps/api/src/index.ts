import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { pathToFileURL } from 'node:url';
import { env } from './config.js';
import { HttpError } from './errors.js';
import { registerRoutes } from './routes.js';
import { StatsService } from './services/stats.js';
import { seedDemoFinder } from './seed.js';
import { createBigQueryRepos } from './store/bigquery.js';
import { EventService } from './services/events.js';
import { FinderService } from './services/finders.js';
import { UserService } from './services/users.js';
import { createLocalRepos } from './store/local.js';
import type { Repos } from './store/types.js';

export async function buildApp(repos: Repos, options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 1024 * 1024, trustProxy: true });

  await app.register(cors, { origin: env.corsOrigins, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  // sendBeacon may arrive as text/plain on some browsers.
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, JSON.parse(String(body || '{}')));
    } catch {
      done(null, {});
    }
  });

  app.setErrorHandler((err: Error, request, reply) => {
    if (err instanceof HttpError) {
      reply.code(err.statusCode).send({ error: err.code, message: err.message, fields: err.fields });
      return;
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(err);
    reply.code(status).send({
      error: status === 429 ? 'rate_limited' : status >= 500 ? 'error' : 'bad_request',
      message: status >= 500 ? '服务器错误，请稍后重试' : err.message,
    });
  });

  const finders = new FinderService(repos.finders);
  const users = new UserService(repos.users);
  const events = new EventService(repos.events, finders);
  const stats = new StatsService(repos.events);
  await registerRoutes(app, { finders, users, events, stats });
  return app;
}

async function main() {
  const bigquery = env.storage === 'bigquery';
  if (bigquery && !env.gcpProjectId) throw new Error('STORAGE=bigquery 需要 GCP_PROJECT_ID');
  const repos = bigquery ? createBigQueryRepos(env.gcpProjectId, env.bqDataset) : createLocalRepos(env.dataDir);
  const app = await buildApp(repos);
  if (!bigquery && (await seedDemoFinder(repos.finders))) {
    app.log.info('Seeded demo finder → /s/demo');
  }
  await app.listen({ port: env.port, host: env.host });
  const target = bigquery ? `bq=${env.gcpProjectId}.${env.bqDataset}` : `data=${env.dataDir}`;
  app.log.info(
    `Try-On API on ${env.host}:${env.port} storage=${env.storage} ${target} ` +
      `google=${env.googleClientId ? 'on' : 'off'} devLogin=${env.devLogin} admins=${env.adminEmails.join(',') || '(none)'}`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
