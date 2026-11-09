// "Forgot password": a one-time code by email. Run against a disposable database:
//   DATABASE_URL=postgres://localhost/bip_gate_qa npm test
process.env.LOGIN_ATTEMPTS = '1000';
process.env.GOOGLE_CLIENT_IDS = '';
process.env.RESET_COOLDOWN_SECONDS = '0';   // the test asks for many codes; one test turns the cooldown back on
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../src/app');
const db = require('../src/db');
const config = require('../src/config');
const { setupDatabase } = require('../src/lib/setup-db');
const { outbox } = require('../src/lib/mailer');

let server, base;
const stamp = Date.now();
const emails = [];
const newEmail = () => { const e = `reset-${stamp}-${emails.length}@example.test`; emails.push(e); return e; };
const OLD = 'the old password is long';
const NEW = 'a completely new password';

async function call(path, body, token) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

// Registers a person and returns the session plus a helper that asks for a code and reads it from the "email".
async function newPerson() {
  const email = newEmail();
  const session = (await call('/auth/register', { email, password: OLD, name: 'Reset Tester' })).data;
  const askForCode = async () => {
    outbox.length = 0;
    await call('/auth/forgot-password', { email });
    return /reset code is (\d{6})/.exec(outbox.at(-1).text)[1];
  };
  return { email, session, askForCode };
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

test('forgot-password answers the same for a known and an unknown email', async () => {
  const { email } = await newPerson();
  outbox.length = 0;
  const known = await call('/auth/forgot-password', { email });
  const unknown = await call('/auth/forgot-password', { email: `nobody-${stamp}@example.test` });
  assert.equal(known.status, 200);
  assert.deepEqual(known.data, unknown.data);   // nobody can use this door to find out who is registered
  assert.equal(outbox.length, 1);               // and only the real address got an email
  assert.equal(outbox[0].to, email);
  assert.equal((await call('/auth/forgot-password', { email: 'not-an-email' })).status, 400);
});

test('the database keeps a hash of the code, never the code', async () => {
  const { email, askForCode } = await newPerson();
  const code = await askForCode();
  assert.match(code, /^\d{6}$/);
  const row = (await db.query(
    'SELECT c.* FROM password_reset_codes c JOIN users u ON u.id = c.user_id WHERE u.email = $1', [email])).rows[0];
  assert.match(row.code_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(row).includes(code));
  const minutes = (new Date(row.expires_at) - new Date(row.created_at)) / 60000;
  assert.ok(minutes > 14.9 && minutes < 15.1);   // 15 minutes to use it
});

test('the right code changes the password, signs everyone out, and works only once', async () => {
  const { email, session, askForCode } = await newPerson();
  const code = await askForCode();

  assert.equal((await call('/auth/reset-password', { email, code, password: 'short' })).status, 400);   // a weak password does not burn the code
  const done = await call('/auth/reset-password', { email, code, password: NEW });
  assert.equal(done.status, 200);

  assert.equal((await call('/auth/login', { email, password: OLD })).status, 401);   // the old password is dead
  assert.equal((await call('/auth/login', { email, password: NEW })).status, 200);
  assert.equal((await call('/auth/refresh', { refreshToken: session.refreshToken })).status, 401);   // the old session is gone

  const again = await call('/auth/reset-password', { email, code, password: 'yet another password' });
  assert.equal(again.status, 400);   // one-time: the same code never works twice
  assert.equal((await call('/auth/login', { email, password: NEW })).status, 200);
});

test('wrong codes: five guesses and the code is dead, even for the right digits', async () => {
  const { email, askForCode } = await newPerson();
  const code = await askForCode();
  const wrong = code === '000000' ? '000001' : '000000';
  for (let i = 0; i < config.resetCodeMaxGuesses; i += 1) {
    assert.equal((await call('/auth/reset-password', { email, code: wrong, password: NEW })).status, 400);
  }
  assert.equal((await call('/auth/reset-password', { email, code, password: NEW })).status, 400);
  assert.equal((await call('/auth/login', { email, password: OLD })).status, 200);   // nothing changed
});

test('an expired code, an unknown email and a badly formed code get the same refusal', async () => {
  const { email, askForCode } = await newPerson();
  const code = await askForCode();
  await db.query(`UPDATE password_reset_codes SET expires_at = now() - interval '1 second'
                   WHERE user_id = (SELECT id FROM users WHERE email = $1)`, [email]);
  const expired = await call('/auth/reset-password', { email, code, password: NEW });
  const unknown = await call('/auth/reset-password', { email: `nobody-${stamp}@example.test`, code: '123456', password: NEW });
  const badShape = await call('/auth/reset-password', { email, code: 'abcdef', password: NEW });
  assert.equal(expired.status, 400);
  assert.deepEqual(expired.data, unknown.data);
  assert.deepEqual(expired.data, badShape.data);
});

test('a new code replaces the old one', async () => {
  const { email, askForCode } = await newPerson();
  const first = await askForCode();
  let second = await askForCode();
  while (second === first) second = await askForCode();   // 1 in a million, but never flaky
  assert.equal((await call('/auth/reset-password', { email, code: first, password: NEW })).status, 400);
  assert.equal((await call('/auth/reset-password', { email, code: second, password: NEW })).status, 200);
});

test('cooldown: asking again within a minute sends no second email', async () => {
  const { email } = await newPerson();
  config.resetCooldownSeconds = 60;
  try {
    outbox.length = 0;
    await call('/auth/forgot-password', { email });
    await call('/auth/forgot-password', { email });
    assert.equal(outbox.length, 1);
  } finally {
    config.resetCooldownSeconds = 0;
  }
});
