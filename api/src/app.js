// Wires the pieces together. server.js starts it; the tests use it directly.
const express = require('express');
const helmet = require('helmet');
const db = require('./db');
const { HttpError } = require('./lib/errors');
const config = require('./config');

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '16kb' }));

// Tokens must never be cached by a browser or a proxy.
app.use('/auth', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

app.get('/', (req, res) => {
  res.json({ app: 'The Gate', health: '/healthz', googleConfigured: config.googleClientIds.length > 0 });
});

app.get('/healthz', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ ok: true, app: 'bip-gate', version: '2.0.0' });
});

app.use('/auth', require('./routes/auth'));
app.use(require('./routes/me'));

app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// Last stop for every error: a clear message for us, never a stack trace for the client.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  console.error('Request failed:', err.code || err.name, err.message);
  res.status(500).json({ error: 'Server error.' });
});

module.exports = { app };
