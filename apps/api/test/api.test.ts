import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

process.env.ADMIN_EMAILS = 'boss@example.com';
process.env.DEV_LOGIN = 'true';
process.env.NODE_ENV = 'test';

const { buildApp } = await import('../src/index.js');
const { createLocalRepos } = await import('../src/store/local.js');
const { seedDemoFinder } = await import('../src/seed.js');

let app: FastifyInstance;
let dataDir: string;

interface Agent {
  cookie: string;
  csrf: string;
}

function cookiesFrom(response: LightMyRequestResponse): Agent {
  const jar = response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const csrf = response.cookies.find((cookie) => cookie.name === 'tryon_csrf')?.value ?? '';
  return { cookie: jar, csrf };
}

async function login(email: string): Promise<Agent> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email } });
  assert.equal(response.statusCode, 200, response.body);
  return cookiesFrom(response);
}

function call(agent: Agent | null, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: agent ? { cookie: agent.cookie, 'x-csrf-token': agent.csrf } : {},
  });
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'tryon-api-'));
  const repos = createLocalRepos(dataDir);
  await seedDemoFinder(repos.finders);
  app = await buildApp(repos, { logger: false });
});

after(async () => {
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
});

test('allowlist + roles', async () => {
  const denied = await app.inject({ method: 'POST', url: '/api/auth/dev-login', payload: { email: 'nobody@example.com' } });
  assert.equal(denied.statusCode, 401);

  const boss = await login('boss@example.com');
  const me = await call(boss, 'GET', '/api/auth/me');
  assert.equal(me.json().role, 'admin');
  assert.equal(me.json().bootstrap, true);

  assert.equal((await call(boss, 'POST', '/api/admin/users', { email: 'viewer@example.com', role: 'viewer' })).statusCode, 201);
  assert.equal((await call(boss, 'POST', '/api/admin/users', { email: 'ed@example.com', role: 'editor' })).statusCode, 201);
  assert.equal((await call(boss, 'POST', '/api/admin/users', { email: 'ed@example.com', role: 'editor' })).statusCode, 409);
  assert.equal((await call(boss, 'DELETE', '/api/admin/users/boss@example.com')).statusCode, 403);

  const viewer = await login('viewer@example.com');
  assert.equal((await call(viewer, 'GET', '/api/finders')).statusCode, 200);
  assert.equal((await call(viewer, 'POST', '/api/finders', { title: 'X' })).statusCode, 403);
  assert.equal((await call(viewer, 'GET', '/api/admin/users')).statusCode, 403);

  // CSRF header required for writes
  const noCsrf = await app.inject({
    method: 'POST',
    url: '/api/finders',
    payload: { title: 'X' },
    headers: { cookie: (await login('ed@example.com')).cookie },
  });
  assert.equal(noCsrf.statusCode, 403);

  // Disabling takes effect on the next request
  assert.equal((await call(boss, 'PUT', '/api/admin/users/viewer@example.com', { role: 'viewer', status: 'disabled' })).statusCode, 200);
  assert.equal((await call(viewer, 'GET', '/api/finders')).statusCode, 401);
});

test('finder lifecycle', async () => {
  const editor = await login('ed@example.com');
  const created = await call(editor, 'POST', '/api/finders', { title: 'Glow Cushion', brand: 'Skintific' });
  assert.equal(created.statusCode, 201);
  const { finder } = created.json();
  assert.match(finder.code, /^[a-z2-9]{8}$/);
  assert.equal(finder.status, 'disabled');

  // Activating without variants fails validation
  const empty = await call(editor, 'POST', `/api/finders/${finder.id}/status`, { status: 'active', version: 1 });
  assert.equal(empty.statusCode, 400);
  assert.ok(empty.json().fields.some((field: { path: string }) => field.path === 'variants'));

  const body = {
    ...finder,
    variants: [
      { id: 'a', name: 'Light', sku: 'GC-01', hex: 'f3d3ba', undertone: 'cool', enabled: true, links: { shop: 'https://a.example/1' } },
      { id: 'b', name: 'Medium', sku: 'GC-02', hex: '#C99568', undertone: 'auto', enabled: true, links: {} },
    ],
    buttons: [{ id: 'shop', label: 'SHOP', url: 'https://a.example', style: 'primary', enabled: true }],
    settings: { ...finder.settings, matching: { depthStep: 99, nearPoolSize: 7, nearMaxExtraDe: 10 } },
    status: 'active',
  };
  const saved = await call(editor, 'PUT', `/api/finders/${finder.id}`, body);
  assert.equal(saved.statusCode, 200, saved.body);
  const savedFinder = saved.json().finder;
  assert.equal(savedFinder.version, 2);
  assert.equal(savedFinder.variants[0].hex, '#F3D3BA');
  assert.equal(savedFinder.settings.matching.depthStep, 10);
  assert.equal(saved.json().codeLocked, true);

  // Stale version → 409
  assert.equal((await call(editor, 'PUT', `/api/finders/${finder.id}`, body)).statusCode, 409);
  // Code can never be changed by a save
  const renamed = await call(editor, 'PUT', `/api/finders/${finder.id}`, { ...savedFinder, code: 'new-code' });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.json().finder.code, finder.code);

  const history = await call(editor, 'GET', `/api/finders/${finder.id}/versions`);
  assert.deepEqual(history.json().items.map((item: { version: number }) => item.version), [3, 2, 1]);

  // Public config hides admin-only fields
  const pub = await call(null, 'GET', `/api/public/finders/${finder.code}`);
  assert.equal(pub.statusCode, 200);
  assert.equal(pub.json().notes, undefined);
  assert.equal(pub.json().variants.length, 2);

  const disabled = await call(editor, 'POST', `/api/finders/${finder.id}/status`, { status: 'disabled', version: 3 });
  assert.equal(disabled.statusCode, 200);
  assert.equal((await call(null, 'GET', `/api/public/finders/${finder.code}`)).statusCode, 404);

  const copy = await call(editor, 'POST', `/api/finders/${finder.id}/duplicate`);
  assert.match(copy.json().finder.code, /^[a-z2-9]{8}$/);
  assert.notEqual(copy.json().finder.code, finder.code);
  assert.equal(copy.json().finder.variants.length, 2);

  const list = await call(editor, 'GET', '/api/finders?q=glow&pageSize=10');
  assert.equal(list.json().total, 2);
  assert.ok(list.json().brands.includes('Skintific'));
});

test('public events ingest', async () => {
  const base = {
    finderCode: 'demo',
    finderVersion: 1,
    visitorId: 'visitor-123456',
    sessionId: 'session-123456',
    clientTs: new Date().toISOString(),
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/public/events',
    headers: {
      'content-type': 'text/plain',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
    },
    payload: JSON.stringify({
      events: [
        { ...base, eventId: 'evt-0000001', name: 'page_view', channel: 'amazon' },
        { ...base, eventId: 'evt-0000002', name: 'undertone_select', undertone: null },
        { ...base, eventId: 'evt-0000003', name: 'feedback', feedback: 'too_light', recommended: [{ variantId: 'v4', sku: 'DEMO-04N', role: 'best' }] },
        { ...base, eventId: 'evt-0000004', name: 'not_a_real_event' },
        { ...base, eventId: 'evt-0000005', name: 'page_view', finderCode: 'missing' },
      ],
    }),
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { accepted: 3, dropped: 2 });

  const { createLocalRepos: open } = await import('../src/store/local.js');
  const today = new Date().toISOString().slice(0, 10);
  const rows = await open(dataDir).events.query('fd_demo', today, today);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].device, 'mobile');
  assert.equal(rows[0].os, 'ios');
  assert.equal(rows[0].channel, 'amazon');
  assert.equal(rows[1].undertone, 'unsure');
  assert.equal(JSON.parse(rows[2].recommended!)[0].role, 'best');

  const boss = await login('boss@example.com');
  const stats = (await call(boss, 'GET', `/api/finders/fd_demo/stats?from=${today}&to=${today}`)).json();
  assert.equal(stats.totals.pageViews, 1);
  assert.equal(stats.totals.sessions, 1);
  assert.equal(stats.totals.feedback.too_light, 1);
  assert.equal(stats.shades[0].variantId, 'v4');
  assert.equal(stats.shades[0].feedback.too_light, 1);
  assert.deepEqual(stats.undertones, [{ key: 'unsure', count: 1 }]);
  assert.deepEqual(stats.channels, ['(direct)', 'amazon']);
  assert.equal(stats.funnel[0].sessions, 1);

  const amazon = (await call(boss, 'GET', `/api/finders/fd_demo/stats?from=${today}&to=${today}&channel=amazon`)).json();
  assert.equal(amazon.totals.feedback.too_light, 0);
  assert.equal(amazon.totals.pageViews, 1);

  assert.equal((await call(boss, 'GET', `/api/finders/fd_demo/stats?from=${today}&to=2020-01-01`)).statusCode, 400);
});
