// Run against a disposable database:  DATABASE_URL=postgres://localhost/bip_gate_qa npm test
// The API documentation must describe the API that really runs: same routes, no more, no less.
process.env.LOGIN_ATTEMPTS = '1000';
process.env.GOOGLE_CLIENT_IDS = '';
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('../src/app');
const db = require('../src/db');

let server, base;
const spec = fs.readFileSync(path.join(__dirname, '../docs/openapi.yaml'), 'utf8');

// The operations the document lists, read straight from its text: "  /path:" then "    get:" or "    post:".
function documented() {
  const out = [];
  let current = null;
  for (const line of spec.split('\n').slice(0, spec.split('\n').findIndex((l) => l === 'components:'))) {
    const p = /^ {2}(\/\S*):$/.exec(line);
    if (p) current = p[1];
    const m = /^ {4}(get|post|put|patch|delete):$/.exec(line);
    if (m && current) out.push(`${m[1].toUpperCase()} ${current}`);
  }
  return out;
}

// The routes the app really has: its own, and those of the two routers it mounts.
function real() {
  const list = (router, prefix) => router.stack.filter((l) => l.route).flatMap((l) =>
    Object.keys(l.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${l.route.path === '/' && prefix ? '' : l.route.path}`));
  return [...list(app.router, ''), ...list(require('../src/routes/auth'), '/auth'), ...list(require('../src/routes/me'), '')]
    .filter((r) => !/ \/(docs|openapi\.yaml)/.test(r));
}

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await db.pool.end();
});

test('the OpenAPI file and the Swagger page are served', async () => {
  const file = await fetch(base + '/openapi.yaml');
  assert.equal(file.status, 200);
  assert.match(await file.text(), /^openapi: 3\.0\.3/);

  const page = await fetch(base + '/docs');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /swagger-ui-bundle\.js/);
  assert.match(html, /integrity="sha384-/);   // the browser checks the files it takes from the CDN
  assert.equal((await fetch(base + '/docs/init.js')).status, 200);

  // The page may load scripts from one CDN, and nothing else. No policy line may quietly open the page to every site.
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net(;|$)/);
  assert.doesNotMatch(csp, /\*|unsafe-eval|http:/);
});

test('every documented operation exists, and every route is documented', async () => {
  const docs = documented().sort();
  assert.equal(docs.length, new Set(docs).size, 'an operation is listed twice');
  assert.deepEqual(real().sort(), docs, 'the OpenAPI file and the routes of the app differ');

  // Calling each one with nothing useful must never end in the 404 of an unknown route.
  for (const op of docs) {
    const [method, route] = op.split(' ');
    const res = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    const body = await res.text();
    assert.ok(!(res.status === 404 && body.includes('Route not found')), `${op} is documented but the API has no such route`);
  }
});
