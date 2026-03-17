import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/jwt.js';

const router = express.Router();

const RESERVED = ['www', 'api', 'admin', 'mail', 'ftp', 'smtp', 'pop', 'imap', 'dev', 'staging', 'test', 'beta', 'app', 'dashboard'];

// Check availability
router.get('/check/:sub', async (req, res) => {
  const { sub } = req.params;
  if (RESERVED.includes(sub.toLowerCase())) return res.json({ available: false, reason: 'reserved' });
  if (!/^[a-zA-Z0-9-]{3,63}$/.test(sub)) return res.json({ available: false, reason: 'invalid' });
  const result = await pool.query('SELECT 1 FROM subdomains WHERE subdomain = $1', [sub]);
  res.json({ available: result.rows.length === 0 });
});

// Claim
router.post('/claim', authenticateToken, async (req, res) => {
  const { subdomain } = req.body;
  if (!subdomain) return res.status(400).json({ error: 'Subdomain is required' });
  if (RESERVED.includes(subdomain.toLowerCase())) return res.status(400).json({ error: 'That subdomain is reserved' });
  if (!/^[a-zA-Z0-9-]{3,63}$/.test(subdomain)) return res.status(400).json({ error: 'Invalid subdomain format' });

  try {
    const existing = await pool.query('SELECT * FROM subdomains WHERE user_id = $1', [req.user.userId]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'You already have a subdomain', subdomain: existing.rows[0].subdomain });
    }
    const result = await pool.query(
      'INSERT INTO subdomains (user_id, subdomain) VALUES ($1, $2) RETURNING *',
      [req.user.userId, subdomain.toLowerCase()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Subdomain already taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Get mine
router.get('/mine', authenticateToken, async (req, res) => {
  const result = await pool.query('SELECT * FROM subdomains WHERE user_id = $1', [req.user.userId]);
  res.json(result.rows[0] || null);
});

// Release
router.delete('/mine', authenticateToken, async (req, res) => {
  const result = await pool.query('DELETE FROM subdomains WHERE user_id = $1 RETURNING *', [req.user.userId]);
  if (result.rows.length === 0) return res.status(404).json({ error: 'No subdomain found' });
  res.json({ message: 'Subdomain released' });
});

export default router;
