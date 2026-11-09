// Every setting comes from an environment variable. See .env.example.
const jwtSecret = process.env.JWT_SECRET || '';
if (jwtSecret.length < 32) {
  throw new Error('Set JWT_SECRET to at least 32 random characters:  openssl rand -hex 32');
}

module.exports = {
  port: Number(process.env.PORT || 3220),
  host: process.env.HOST || '127.0.0.1',               // the Android emulator reaches this machine at 10.0.2.2
  databaseUrl: process.env.DATABASE_URL || 'postgres://localhost/bip_gate',

  jwtSecret,
  jwtIssuer: 'bip-gate',
  jwtAudience: 'bip-gate-api',
  accessTokenSeconds: Number(process.env.ACCESS_TOKEN_SECONDS || 900),   // 15 minutes
  refreshTokenDays: 7,

  // Web OAuth client ID(s) from Google Cloud. Public identifiers, not secrets.
  googleClientIds: (process.env.GOOGLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),

  loginAttemptsPer15Min: Number(process.env.LOGIN_ATTEMPTS || 20),

  // Forgot password: a 6-digit code that works once, for 15 minutes, with 5 guesses.
  resetCodeMinutes: 15,
  resetCodeMaxGuesses: 5,
  resetCooldownSeconds: Number(process.env.RESET_COOLDOWN_SECONDS ?? 60),   // one new code per address per minute

  // Email. Without SMTP_URL the email is printed in the API log (your own computer has no mail server).
  smtpUrl: process.env.SMTP_URL || '',
  mailFrom: process.env.MAIL_FROM || 'The Gate <no-reply@gate.example>',
};

if (process.env.NODE_ENV === 'production' && !module.exports.smtpUrl) {
  throw new Error('In production, set SMTP_URL: reset codes must be emailed, never printed in a log.');
}
