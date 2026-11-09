// The doors: register, login, google, refresh, logout, forgot-password, reset-password, google/link.
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../lib/errors');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const { issueSession, rotateRefreshToken, revokeRefreshToken } = require('../lib/tokens');
const { verifyGoogleIdToken } = require('../lib/google');
const { createPasswordUser, findOrCreateGoogleUser, linkGoogle, publicUser } = require('../lib/users');
const { createResetCode, useResetCode, sendResetEmail } = require('../lib/reset-codes');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const SENT = `If an account uses this email, we sent a 6-digit code. It works for ${config.resetCodeMinutes} minutes.`;

// At most 20 tries per address every 15 minutes on the doors that guess passwords or codes.
const slowDown = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginAttemptsPer15Min,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const clean = (value) => String(value ?? '').trim();

function readEmail(body) {
  const email = clean(body?.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(400, 'Enter a valid email address.');
  }
  return email;
}

function readName(body) {
  const name = clean(body?.name);
  if (name.length < 1 || name.length > 100) throw new HttpError(400, 'Enter your name (up to 100 characters).');
  return name;
}

function readPassword(body) {   // for login: no rules, just a type and a size limit
  return typeof body?.password === 'string' ? body.password.slice(0, 128) : '';
}

function readNewPassword(body) {
  const password = body?.password;
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
    throw new HttpError(400, 'Use a password of 12 to 128 characters.');
  }
  return password;
}

// ── POST /auth/register ────────────────────────────────────────────────────────
router.post('/register', slowDown, async (req, res) => {
  const email = readEmail(req.body);
  const password = readNewPassword(req.body);
  const name = readName(req.body);

  const passwordHash = await hashPassword(password);
  const user = await createPasswordUser({ email, name, passwordHash });   // 409 if the email exists

  res.status(201).json(await issueSession(user));
});

// ── POST /auth/login ───────────────────────────────────────────────────────────
router.post('/login', slowDown, async (req, res) => {
  const email = readEmail(req.body);
  const password = readPassword(req.body);

  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];

  // Same work whether or not the user exists, and one message for both mistakes.
  const ok = await verifyPassword(user?.password_hash, password);
  if (!ok) throw new HttpError(401, 'Wrong email or password.');

  res.json(await issueSession(user));
});

// ── POST /auth/google ──────────────────────────────────────────────────────────
router.post('/google', slowDown, async (req, res) => {
  const profile = await verifyGoogleIdToken(req.body?.idToken);   // throws 400 / 401 / 503
  const user = await findOrCreateGoogleUser(profile);
  res.json(await issueSession(user));
});

// ── POST /auth/refresh ─────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const session = await rotateRefreshToken(req.body?.refreshToken);
  if (!session) throw new HttpError(401, 'Please sign in again.');
  res.json(session);
});

// ── POST /auth/logout ──────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  await revokeRefreshToken(req.body?.refreshToken);
  res.status(204).end();
});

// ── POST /auth/google/link ─────────────────────────────────────────────────────
// For a person who is ALREADY signed in (say, with a password) and wants Google as a second way in.
router.post('/google/link', requireAuth, slowDown, async (req, res) => {
  const profile = await verifyGoogleIdToken(req.body?.idToken);
  const user = await linkGoogle(req.user, profile);
  res.json(publicUser(user));
});

// ── POST /auth/forgot-password ─────────────────────────────────────────────────
router.post('/forgot-password', slowDown, async (req, res) => {
  const email = readEmail(req.body);
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows[0]) {
    const code = await createResetCode(rows[0].id);   // null if one was sent a moment ago
    // Not awaited: the answer must not be slower when the address has an account.
    if (code) sendResetEmail(email, code).catch((e) => console.error('Email failed:', e.message));
  }
  // The same answer for every address: this door cannot tell anyone who is registered.
  res.json({ message: SENT });
});

// ── POST /auth/reset-password ──────────────────────────────────────────────────
router.post('/reset-password', slowDown, async (req, res) => {
  const email = readEmail(req.body);
  const code = clean(req.body?.code);
  const password = readNewPassword(req.body);
  const refused = new HttpError(400, 'That code is wrong or has expired. Ask for a new one.');
  if (!/^\d{6}$/.test(code)) throw refused;
  const { rows } = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  const userId = rows[0]?.id;
  if (!userId || !(await useResetCode(userId, code))) throw refused;   // one message for every failure
  const passwordHash = await hashPassword(password);
  await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);   // old sessions end
  res.json({ message: 'Password changed. Sign in with your new password.' });
});

module.exports = router;
