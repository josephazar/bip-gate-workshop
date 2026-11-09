// Start here:  npm start
const config = require('./config');
const db = require('./db');
const { app } = require('./app');
const { setupDatabase } = require('./lib/setup-db');

async function main() {
  console.log('Preparing the database…');
  await setupDatabase();                                                   // idempotent
  await db.query("DELETE FROM refresh_tokens WHERE expires_at < now() - interval '1 day'");

  const server = app.listen(config.port, config.host, () => {
    console.log(`The Gate API is ready: http://${config.host}:${config.port}`);
    console.log(config.googleClientIds.length ? 'Google sign-in: configured' : 'Google sign-in: not configured (email + password only)');
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(async () => { await db.pool.end(); process.exit(0); }));
  }
}

main().catch((e) => {
  const hint = e.code === 'ECONNREFUSED' ? ' Is PostgreSQL running?' : e.code === '3D000' ? ' Create it first:  createdb bip_gate' : '';
  console.error(`Could not start: ${e.message}.${hint}`);
  process.exit(1);
});
