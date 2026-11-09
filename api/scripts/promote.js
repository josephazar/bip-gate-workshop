// npm run promote -- someone@example.com          make them an admin
// npm run promote -- someone@example.com user     back to a normal user
const db = require('../src/db');

const [email, role = 'admin'] = process.argv.slice(2);
if (!email || !['admin', 'user'].includes(role)) {
  console.error('Usage: npm run promote -- <email> [admin|user]');
  process.exit(1);
}

db.query('UPDATE users SET role = $2 WHERE email = lower($1) RETURNING email, role', [email, role])
  .then((r) => console.log(r.rowCount ? `${r.rows[0].email} is now: ${r.rows[0].role}` : 'No user with that email.'))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
