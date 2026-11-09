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
};
