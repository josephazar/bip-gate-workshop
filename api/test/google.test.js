// Google sign-in with the signature check replaced by a stub. The real check is google-auth-library's job;
// here we test OUR rules: find or create by Google subject, never merge by email, verified email only.
process.env.LOGIN_ATTEMPTS = '1000';
process.env.GOOGLE_CLIENT_IDS = 'test-web-client.apps.googleusercontent.com';
process.env.RESET_COOLDOWN_SECONDS = '0';
const { test, after, before, mock } = require('node:test');
const assert = require('node:assert/strict');
const { OAuth2Client } = require('google-auth-library');
const { app } = require('../src/app');
const db = require('../src/db');
const { setupDatabase } = require('../src/lib/setup-db');
const { outbox } = require('../src/lib/mailer');

let server, base, nextPayload, lastAudience;
const stamp = Date.now();
const googleEmail = `google-${stamp}@example.test`;
const passwordEmail = `pw-${stamp}@example.test`;
const otherEmail = `other-${stamp}@example.test`;
const googleOnlyEmail = `gonly-${stamp}@example.test`;

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
  await db.query('DELETE FROM users WHERE email = ANY($1)', [[googleEmail, passwordEmail, otherEmail, googleOnlyEmail]]);
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
  assert.deepEqual(first.data.user.methods, ['google']);
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
  assert.equal(res.data.code, 'email_has_password');   // the app can show the right hint
  assert.equal((await db.query('SELECT google_sub FROM users WHERE email = $1', [passwordEmail])).rows[0].google_sub, null);
});

test('linking: a signed-in password user adds Google, then both doors open the same account', async () => {
  const pw = await call('/auth/login', { email: passwordEmail, password: 'a long enough password' });
  assert.deepEqual(pw.data.user.methods, ['password']);

  assert.equal((await call('/auth/google/link', { idToken: 'valid-token' })).status, 401);   // must be signed in

  nextPayload = { sub: `sub3-${stamp}`, email: passwordEmail, email_verified: true, name: 'Pat G' };
  assert.equal((await call('/auth/google/link', { idToken: 'forged' }, pw.data.accessToken)).status, 401);
  const linked = await call('/auth/google/link', { idToken: 'valid-token' }, pw.data.accessToken);
  assert.equal(linked.status, 200);
  assert.deepEqual(linked.data.methods, ['password', 'google']);

  const viaGoogle = await call('/auth/google', { idToken: 'valid-token' });   // now Google finds the same account
  assert.equal(viaGoogle.status, 200);
  assert.equal(viaGoogle.data.user.id, pw.data.user.id);
  assert.equal((await call('/auth/login', { email: passwordEmail, password: 'a long enough password' })).status, 200);

  // a second link on the same account, or a Google account that belongs to someone else, is refused
  assert.equal((await call('/auth/google/link', { idToken: 'valid-token' }, pw.data.accessToken)).data.code, 'already_linked');
  const other = await call('/auth/register', { email: otherEmail, password: 'another long password', name: 'Olly' });
  assert.equal((await call('/auth/google/link', { idToken: 'valid-token' }, other.data.accessToken)).data.code, 'google_in_use');
});

test('a Google-only account can add a password with a reset code', async () => {
  nextPayload = { sub: `sub4-${stamp}`, email: googleOnlyEmail, email_verified: true, name: 'Gus' };
  const first = await call('/auth/google', { idToken: 'valid-token' });
  assert.deepEqual(first.data.user.methods, ['google']);

  // registering the same email with a password is refused, and points to "Forgot password"
  const clash = await call('/auth/register', { email: googleOnlyEmail, password: 'a long enough password', name: 'Gus' });
  assert.equal(clash.status, 409);
  assert.match(clash.data.error, /Forgot password/);

  outbox.length = 0;
  await call('/auth/forgot-password', { email: googleOnlyEmail });
  const code = /reset code is (\d{6})/.exec(outbox.at(-1).text)[1];
  const reset = await call('/auth/reset-password', { email: googleOnlyEmail, code, password: 'my brand new password' });
  assert.equal(reset.status, 200);

  const login = await call('/auth/login', { email: googleOnlyEmail, password: 'my brand new password' });
  assert.equal(login.status, 200);
  assert.deepEqual(login.data.user.methods, ['password', 'google']);
  assert.equal(login.data.user.id, first.data.user.id);   // the same account, now with two ways in
});
