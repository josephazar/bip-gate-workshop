// Runs every database/*.sql file in order. Safe to run again: the scripts use IF NOT EXISTS.
const fs = require('node:fs');
const path = require('node:path');
const db = require('../db');

const folder = path.join(__dirname, '..', '..', '..', 'database');

async function setupDatabase() {
  const files = fs.readdirSync(folder).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.query(fs.readFileSync(path.join(folder, file), 'utf8'));
    console.log(`  ran database/${file}`);
  }
}

module.exports = { setupDatabase };
