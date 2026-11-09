// The five doors: register, login, google, refresh, logout.
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { HttpError } = require('../lib/errors');
const { hashPassword, verifyPassword } = require('../lib/passwords');
const { issueSession, rotateRefreshToken, revokeRefreshToken } = require('../lib/tokens');
const { verifyGoogleIdToken } = require('../lib/google');
const { createPasswordUser, findOrCreateGoogleUser } = require('../lib/users');

const router = express.Router();

// At most 20 tries per address every 15 minutes on the doors that guess passwords.
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

module.exports = router;
