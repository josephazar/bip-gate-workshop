// Two kinds of token:
//   access token  = a signed JWT, valid for minutes. The app sends it with every request.
//   refresh token = a random string, valid for days. It only buys a new access token. Stored hashed.
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { publicUser } = require('./users');
const { HttpError } = require('./errors');

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

// ── Access token ───────────────────────────────────────────────────────────────
function signAccessToken(user) {
  return jwt.sign({ role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,                       // "sub": who this token is about
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    expiresIn: config.accessTokenSeconds,   // "exp"
  });
}

function verifyAccessToken(token) {
  try {
    // Checks the signature, the algorithm, issuer, audience and expiry together.
    return jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });
  } catch {
    throw new HttpError(401, 'Your sign-in is invalid or expired.');
  }
}

// ── Refresh token ──────────────────────────────────────────────────────────────
async function createRefreshToken(userId, expiresAt) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, sha256(token), expiresAt],
  );
  return token;   // the only copy: the database keeps just the hash
}

// What every successful sign-in returns.
async function issueSession(user, refreshExpiresAt) {
  const expiresAt = refreshExpiresAt || new Date(Date.now() + config.refreshTokenDays * 86400000);
  return {
    accessToken: signAccessToken(user),
    refreshToken: await createRefreshToken(user.id, expiresAt),
    expiresIn: config.accessTokenSeconds,
    user: publicUser(user),
  };
}

// Exchange a refresh token for a new pair. Each refresh token works exactly once.
async function rotateRefreshToken(token) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const hash = sha256(token);

  // One atomic statement: only one request can ever win this UPDATE.
  const used = await db.query(
    `UPDATE refresh_tokens SET used_at = now()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id, expires_at`,
    [hash],
  );

  if (used.rowCount === 0) {
    // Unknown, expired, or already used. An already-used token coming back means a copy was stolen:
    // sign that person out everywhere.
    const replayed = await db.query(
      'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND used_at IS NOT NULL', [hash]);
    if (replayed.rowCount) {
      await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [replayed.rows[0].user_id]);
    }
    return null;
  }

  const { user_id: userId, expires_at: expiresAt } = used.rows[0];
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  return issueSession(user, expiresAt);   // the new token keeps the original 7-day limit
}

async function revokeRefreshToken(token) {
  if (typeof token === 'string' && token.length <= 200) {
    await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [sha256(token)]);
  }
}

module.exports = { verifyAccessToken, issueSession, rotateRefreshToken, revokeRefreshToken };
