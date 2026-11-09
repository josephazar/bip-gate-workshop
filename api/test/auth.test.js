// Run against a disposable database:  DATABASE_URL=postgres://localhost/bip_gate_qa npm test
process.env.LOGIN_ATTEMPTS = '1000';   // the test makes many logins from one address
process.env.GOOGLE_CLIENT_IDS = '';    // this file tests the server without Google configured
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../src/app');
const db = require('../src/db');
const config = require('../src/config');
const { setupDatabase } = require('../src/lib/setup-db');

let server, base;
const emails = [];
const newEmail = () => { const e = `qa-${Date.now()}-${emails.length}@example.test`; emails.push(e); return e; };
const PASSWORD = 'correct horse battery staple';

async function call(path, { body, token, method } = {}) {
  const res = await fetch(base + path, {
    method: method || (body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

before(async () => {
  await setupDatabase();
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await db.query('DELETE FROM users WHERE email = ANY($1)', [emails]);
  await new Promise((r) => server.close(r));
  await db.pool.end();
});

test('health check and the closed door', async () => {
  assert.deepEqual((await call('/healthz')).data, { ok: true, app: 'bip-gate', version: '2.0.0' });
  assert.equal((await call('/me')).status, 401);
  assert.equal((await call('/nope')).status, 404);
});

test('register: validation, hashing, no role escalation, duplicates', async () => {
  const email = newEmail();
  assert.equal((await call('/auth/register', { body: { email, password: 'short', name: 'QA' } })).status, 400);
  assert.equal((await call('/auth/register', { body: { email: 'not-an-email', password: PASSWORD, name: 'QA' } })).status, 400);

  const ok = await call('/auth/register', { body: { email, password: PASSWORD, name: 'QA', role: 'admin' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.role, 'user');                         // a client can never choose its own role
  assert.deepEqual(ok.data.user.methods, ['password']);
  assert.ok(!JSON.stringify(ok.data).includes('password_hash'));

  const row = (await db.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
  assert.ok(row.password_hash.startsWith('$argon2id$'));
  assert.notEqual(row.password_hash, PASSWORD);

  assert.equal((await call('/auth/register', { body: { email, password: PASSWORD, name: 'QA' } })).status, 409);
});

test('login: one message for a wrong password and an unknown email', async () => {
  const email = newEmail();
  await call('/auth/register', { body: { email, password: PASSWORD, name: 'QA' } });

  const wrong = await call('/auth/login', { body: { email, password: 'not the right password' } });
  const unknown = await call('/auth/login', { body: { email: newEmail(), password: PASSWORD } });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.data, unknown.data);

  const good = await call('/auth/login', { body: { email: email.toUpperCase(), password: PASSWORD } });
  assert.equal(good.status, 200);
  assert.ok(good.data.accessToken && good.data.refreshToken);
});

test('protected routes: 401 for bad tokens, 403 for the wrong role, role read from the database', async () => {
  const email = newEmail();
  const { data } = await call('/auth/register', { body: { email, password: PASSWORD, name: 'QA' } });
  const id = data.user.id;

  assert.equal((await call('/me', { token: data.accessToken })).data.email, email);
  assert.equal((await call('/admin/users', { token: data.accessToken })).status, 403);

  const claims = { role: 'admin' };
  const sign = (secret, extra = {}) => jwt.sign(claims, secret, {
    algorithm: 'HS256', subject: id, issuer: config.jwtIssuer, audience: config.jwtAudience, expiresIn: 900, ...extra });

  assert.equal((await call('/me', { token: sign('a completely different signing key!!!!!') })).status, 401);   // forged
  assert.equal((await call('/me', { token: sign(config.jwtSecret, { expiresIn: -10 }) })).status, 401);        // expired
  assert.equal((await call('/me', { token: sign(config.jwtSecret, { audience: 'someone-else' }) })).status, 401);
  assert.equal((await call('/me', { token: sign(config.jwtSecret, { issuer: 'someone-else' }) })).status, 401);
  const [h, p] = data.accessToken.split('.');
  assert.equal((await call('/me', { token: `${h}.${p}.` })).status, 401);                                       // signature removed
  const none = Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url');
  assert.equal((await call('/me', { token: `${none}.${p}.` })).status, 401);                                    // alg "none"
  const tampered = Buffer.from(JSON.stringify({ ...jwt.decode(data.accessToken), role: 'admin' })).toString('base64url');
  assert.equal((await call('/admin/users', { token: `${h}.${tampered}.${data.accessToken.split('.')[2]}` })).status, 401);

  // A token whose claim still says "user" works as soon as the DATABASE says admin.
  await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [id]);
  assert.equal((await call('/admin/users', { token: data.accessToken })).status, 200);
  await db.query("UPDATE users SET role = 'user' WHERE id = $1", [id]);
  assert.equal((await call('/admin/users', { token: data.accessToken })).status, 403);
});

test('refresh: rotation, replay, logout, absolute lifetime and the race', async () => {
  const email = newEmail();
  const first = (await call('/auth/register', { body: { email, password: PASSWORD, name: 'QA' } })).data;

  const second = await call('/auth/refresh', { body: { refreshToken: first.refreshToken } });
  assert.equal(second.status, 200);
  assert.notEqual(second.data.refreshToken, first.refreshToken);
  assert.equal((await call('/me', { token: second.data.accessToken })).status, 200);

  const rows = (await db.query('SELECT token_hash, expires_at FROM refresh_tokens WHERE user_id = $1', [first.user.id])).rows;
  assert.equal(rows.length, 2);
  assert.equal(rows[0].expires_at.getTime(), rows[1].expires_at.getTime());           // the 7-day limit is carried over
  assert.ok(!rows.some((r) => r.token_hash === first.refreshToken));                   // only hashes are stored

  // Replaying the first token: refused, and every token of this person is revoked.
  assert.equal((await call('/auth/refresh', { body: { refreshToken: first.refreshToken } })).status, 401);
  assert.equal((await call('/auth/refresh', { body: { refreshToken: second.data.refreshToken } })).status, 401);

  // Logout removes the token.
  const login = (await call('/auth/login', { body: { email, password: PASSWORD } })).data;
  assert.equal((await call('/auth/logout', { body: { refreshToken: login.refreshToken } })).status, 204);
  assert.equal((await call('/auth/refresh', { body: { refreshToken: login.refreshToken } })).status, 401);
  assert.equal((await call('/auth/refresh', { body: { refreshToken: 'garbage' } })).status, 401);
  assert.equal((await call('/auth/refresh', { body: {} })).status, 401);

  // Two requests with the same refresh token: exactly one wins.
  const login2 = (await call('/auth/login', { body: { email, password: PASSWORD } })).data;
  const race = await Promise.all([
    call('/auth/refresh', { body: { refreshToken: login2.refreshToken } }),
    call('/auth/refresh', { body: { refreshToken: login2.refreshToken } }),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [200, 401]);

  // An expired refresh token is refused.
  const login3 = (await call('/auth/login', { body: { email, password: PASSWORD } })).data;
  await db.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [first.user.id]);
  assert.equal((await call('/auth/refresh', { body: { refreshToken: login3.refreshToken } })).status, 401);
});

test('google: not configured, so 503 (the password doors keep working)', async () => {
  assert.equal(config.googleClientIds.length, 0);
  assert.equal((await call('/auth/google', { body: { idToken: 'x' } })).status, 503);
});

test('malformed bodies are answered with 400, not a crash', async () => {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(res.status, 400);
  assert.equal((await call('/auth/login', { body: { email: 'a@b.co' } })).status, 401);
});
