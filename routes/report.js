import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

router.post('/report', async (req, res) => {
  const { shortCode, longUrl, linkId } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  try {
    await pool.query(
      `INSERT INTO abuse_reports (link_id, short_code, long_url, reporter_ip)
       VALUES ($1, $2, $3, $4)`,
      [linkId || null, shortCode, longUrl, ip]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('REPORT ERROR:', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

export default router;