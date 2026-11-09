// One connection pool for the whole API.
const { Pool } = require('pg');
const { databaseUrl } = require('./config');

const pool = new Pool({ connectionString: databaseUrl, max: 10 });
pool.on('error', (e) => console.error('Database connection error:', e.code));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params),
};
