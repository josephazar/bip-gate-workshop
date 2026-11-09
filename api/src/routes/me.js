// Protected routes: they only answer to a valid access token.
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/requireAuth');
const { publicUser } = require('../lib/users');

const router = express.Router();

// Any signed-in user.
router.get('/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user));
});

// Admins only: a normal user gets 403 here.
router.get('/admin/users', requireAuth, requireRole('admin'), async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, email, name, role, created_at FROM users ORDER BY created_at LIMIT 200');
  res.json(rows);
});

module.exports = router;
