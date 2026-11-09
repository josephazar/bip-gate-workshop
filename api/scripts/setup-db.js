// npm run db:setup  -> creates the tables (Step 1 and Step 6 of the workshop).
const db = require('../src/db');
const { setupDatabase } = require('../src/lib/setup-db');

console.log('Creating the tables…');
setupDatabase()
  .then(() => console.log('Done.'))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
