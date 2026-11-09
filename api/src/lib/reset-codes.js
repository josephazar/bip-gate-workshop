// The one-time code behind "Forgot password": made, hashed, checked once, then gone.
const crypto = require('node:crypto');
const db = require('../db');
const config = require('../config');
const { sendMail } = require('./mailer');

// Six digits are easy to guess offline, so the table keeps a keyed hash (HMAC), not the digits.
const hashCode = (userId, code) =>
  crypto.createHmac('sha256', config.jwtSecret).update(`${userId}:${code}`).digest('hex');

// Makes a fresh code and replaces any older one. Returns null if one was made a moment ago.
async function createResetCode(userId) {
  const recent = await db.query(
    `SELECT 1 FROM password_reset_codes
      WHERE user_id = $1 AND created_at > now() - make_interval(secs => $2)`,
    [userId, config.resetCooldownSeconds],
  );
  if (recent.rowCount) return null;

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');   // never Math.random
  await db.query('DELETE FROM password_reset_codes WHERE user_id = $1', [userId]);
  await db.query(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [userId, hashCode(userId, code), config.resetCodeMinutes],
  );
  return code;
}

async function sendResetEmail(to, code) {
  await sendMail({
    to,
    subject: 'Your Gate reset code',
    text: `Your Gate reset code is ${code}\n\nIt works once, for ${config.resetCodeMinutes} minutes.\n`
      + 'If you did not ask for it, ignore this email: your password has not changed.',
  });
}

// true when the code is right. It is used up at the same moment, so it can never work twice.
async function useResetCode(userId, code) {
  // Every guess is counted first, in one atomic statement: parallel guesses cannot beat the limit.
  const { rows } = await db.query(
    `UPDATE password_reset_codes SET attempts = attempts + 1
      WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() AND attempts < $2
      RETURNING id, code_hash`,
    [userId, config.resetCodeMaxGuesses],
  );
  if (!rows[0]) return false;   // none asked for, expired, or out of guesses
  const right = Buffer.from(rows[0].code_hash, 'hex');
  const given = Buffer.from(hashCode(userId, code), 'hex');
  if (!crypto.timingSafeEqual(right, given)) return false;
  const used = await db.query(
    'UPDATE password_reset_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL', [rows[0].id]);
  return used.rowCount === 1;
}

module.exports = { createResetCode, useResetCode, sendResetEmail };
