// Google sign-in with the signature check replaced by a stub. The real check is google-auth-library's job;
// here we test OUR rules: find or create by Google subject, never merge by email, verified email only.
process.env.LOGIN_ATTEMPTS = '1000';
process.env.GOOGLE_CLIENT_IDS = 'test-web-client.apps.googleusercontent.com';
const { test, after, before, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OAuth2Client } = require('google-auth-library');
const { app } = require('../src/app');
const db = require('../src/db');
const { setupDatabase } = require('../src/lib/setup-db');

let server, base, nextPayload, lastAudience;
const stamp = Date.now();
const googleEmail = `google-${stamp}@example.test`;
const passwordEmail = `pw-${stamp}@example.test`;

const call = async (path, body, token) => {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};

before(async () => {
  await setupDatabase();
  mock.method(OAuth2Client.prototype, 'verifyIdToken', async ({ idToken, audience }) => {
    lastAudience = audience;
    if (idToken !== 'valid-token') throw new Error('Invalid token signature');
    return { getPayload: () => nextPayload };
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await db.query('DELETE FROM users WHERE email = ANY($1)', [[googleEmail, passwordEmail]]);
  await new Promise((r) => server.close(r));
  await db.pool.end();
});

test('a bad or missing Google token is refused', async () => {
  assert.equal((await call('/auth/google', {})).status, 400);
  assert.equal((await call('/auth/google', { idToken: 'forged' })).status, 401);
});

test('a verified Google identity creates an account once, keyed by the subject', async () => {
  nextPayload = { sub: `sub-${stamp}`, email: googleEmail, email_verified: true, name: 'Gina Google' };
  const first = await call('/auth/google', { idToken: 'valid-token' });
  assert.equal(first.status, 200);
  assert.equal(first.data.user.provider, 'google');
  assert.equal(first.data.user.name, 'Gina Google');
  assert.deepEqual(lastAudience, ['test-web-client.apps.googleusercontent.com']);   // OUR client id is the accepted audience
  assert.equal((await call('/me', null, first.data.accessToken)).data.email, googleEmail);

  const again = await call('/auth/google', { idToken: 'valid-token' });
  assert.equal(again.data.user.id, first.data.user.id);   // same person, same account

  // A Google-only account has no password to guess.
  assert.equal((await call('/auth/login', { email: googleEmail, password: 'anything at all here' })).status, 401);
});

test('an unverified Google email is refused', async () => {
  nextPayload = { sub: `sub2-${stamp}`, email: `x-${stamp}@example.test`, email_verified: false, name: 'X' };
  assert.equal((await call('/auth/google', { idToken: 'valid-token' })).status, 401);
});

test('the same email as a password account is never merged automatically', async () => {
  await call('/auth/register', { email: passwordEmail, password: 'a long enough password', name: 'Pat' });
  nextPayload = { sub: `sub3-${stamp}`, email: passwordEmail, email_verified: true, name: 'Pat G' };
  const res = await call('/auth/google', { idToken: 'valid-token' });
  assert.equal(res.status, 409);
  assert.equal((await db.query('SELECT google_sub FROM users WHERE email = $1', [passwordEmail])).rows[0].google_sub, null);
});
