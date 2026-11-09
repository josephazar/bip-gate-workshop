// The keeper of the gate: every protected route runs this first.
const db = require('../db');
const { HttpError } = require('../lib/errors');
const { verifyAccessToken } = require('../lib/tokens');

async function requireAuth(req, res, next) {
  const match = /^Bearer (\S+)$/.exec(req.get('authorization') || '');
  if (!match) throw new HttpError(401, 'Sign in first.');

  const claims = verifyAccessToken(match[1]);   // bad signature, expired, wrong audience: 401

  const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [claims.sub]);
  if (!rows[0]) throw new HttpError(401, 'Your sign-in is invalid or expired.');

  req.user = rows[0];   // the role comes from the DATABASE, never from the token
  next();
}

const requireRole = (role) => (req, res, next) => {
  if (req.user.role !== role) throw new HttpError(403, 'You are signed in, but you may not do this.');
  next();
};

module.exports = { requireAuth, requireRole };
