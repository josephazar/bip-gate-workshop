// Everything that reads or writes the users table lives here.
const db = require('../db');
const { HttpError } = require('./errors');

// What the app may see about a user. Never send password_hash or google_sub.
const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  provider: u.google_sub ? 'google' : 'password',
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
      throw new HttpError(409, 'That email is already registered. Sign in instead.');
    }
    throw e;
  }
}

async function findOrCreateGoogleUser(profile) {
  const found = await db.query('SELECT * FROM users WHERE google_sub = $1', [profile.sub]);
  if (found.rows[0]) return found.rows[0];   // a returning person

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
      throw new HttpError(409, 'An account with this email already exists. Sign in with your password.');
    }
    throw e;
  }
}

module.exports = { publicUser, createPasswordUser, findOrCreateGoogleUser };
