// Everything that reads or writes the users table lives here.
const db = require('../db');
const { HttpError } = require('./errors');

// What the app may see about a user. Never send password_hash or google_sub.
// "methods" lists the ways this person can sign in: one account can have both.
const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  methods: [u.password_hash && 'password', u.google_sub && 'google'].filter(Boolean),
});

async function createPasswordUser({ email, name, passwordHash }) {
  try {
    const { rows } = await db.query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [email, name, passwordHash],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') {   // the UNIQUE(email) rule of the table
      throw new HttpError(409, 'That email has an account. Sign in, or use Forgot password.');
    }
    throw e;
  }
}

async function findOrCreateGoogleUser(profile) {
  const found = await db.query('SELECT * FROM users WHERE google_sub = $1', [profile.sub]);
  if (found.rows[0]) return found.rows[0];   // a returning person (or one who linked Google earlier)

  return createGoogleUser(profile);          // the first time: make the account
}

async function createGoogleUser(profile) {
  try {
    const { rows } = await db.query(
      'INSERT INTO users (email, name, google_sub) VALUES ($1, $2, $3) RETURNING *',
      [profile.email.toLowerCase(), String(profile.name || profile.email).slice(0, 100), profile.sub],
    );
    return rows[0];
  } catch (e) {
    if (e.code === '23505') {   // this email already belongs to a password account: never merge on email alone
      throw new HttpError(409,
        'This email already has a password account. Sign in with your password, then tap "Link Google account".',
        'email_has_password');
    }
    throw e;
  }
}

// A signed-in person adds Google to the account they are already in.
// They proved the password (they hold a session) AND Google (the token): that is what makes it safe.
async function linkGoogle(user, profile) {
  if (user.google_sub) throw new HttpError(409, 'Google is already linked.', 'already_linked');
  try {
    await db.query(
      'UPDATE users SET google_sub = $1 WHERE id = $2 AND google_sub IS NULL', [profile.sub, user.id]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'That Google account is already used.', 'google_in_use');
    throw e;
  }
  return (await db.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
}

module.exports = { publicUser, createPasswordUser, findOrCreateGoogleUser, linkGoogle };
