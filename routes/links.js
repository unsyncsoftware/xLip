// ============================================================
// xlip.uk — Links Routes (updated with usage limits)
// File: routes/links.js (full replacement)
// ============================================================

import express from 'express';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { pool } from '../db.js';
import { authenticateToken, optionalAuth } from '../middleware/jwt.js';
import { guestShortenLimit } from '../middleware/rateLimit.js';
import { logVisit } from '../middleware/logger.js';
import { checkLimit, incrementLinkCount } from '../middleware/checkLimit.js';

const router = express.Router();

// ── SHORTEN ──
router.post('/shorten', optionalAuth, guestShortenLimit, checkLimit, logVisit('link_shortened'), async (req, res) => {
  const { longUrl, customAlias, password, expiresAt } = req.body;
  const domainName = req.get('host');
  const shortCode = nanoid(6);

  try { new URL(longUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  // Safe Browsing check
  const sbRes = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_SAFE_BROWSING_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client: { clientId: 'xlip.uk', clientVersion: '1.0' },
      threatInfo: {
        threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
        platformTypes: ['ANY_PLATFORM'],
        threatEntryTypes: ['URL'],
        threatEntries: [{ url: longUrl }]
      }
    })
  });
  const sbData = await sbRes.json();
  if (sbData.matches && sbData.matches.length > 0) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    pool.query(
      'INSERT INTO visitor_logs (ip_address, action, detail) VALUES ($1, $2, $3)',
      [ip, 'url_blocked', longUrl]
    ).catch(() => {});
    return res.status(400).json({ error: 'URL flagged as unsafe' });
  }

  try {
    if (customAlias) {
      const exists = await pool.query(
        'SELECT 1 FROM links WHERE custom_alias = $1 AND domain_name = $2',
        [customAlias, domainName]
      );
      if (exists.rows.length) return res.status(409).json({ error: 'Alias taken' });
    }

    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const userId = req.user ? req.user.userId : null;

    await pool.query(
      `INSERT INTO links (long_url, short_code, custom_alias, user_id, link_password_hash, expires_at, domain_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [longUrl, shortCode, customAlias || null, userId, passwordHash, expiresAt || null, domainName]
    );

    // Increment usage count for logged-in users
    if (userId) await incrementLinkCount(userId);

    res.json({ shortUrl: `https://${domainName}/${customAlias || shortCode}` });
  } catch (err) {
    console.error('SHORTEN ERROR:', err);
    res.status(500).json({ error: 'Shortening failed' });
  }
});

// ── GET USER LINKS ──
router.get('/user/links', authenticateToken, async (req, res) => {
  const result = await pool.query(
    `SELECT l.*, COUNT(a.id) AS clicks FROM links l LEFT JOIN analytics a ON l.id = a.link_id
     WHERE l.user_id = $1 GROUP BY l.id ORDER BY l.created_at DESC`,
    [req.user.userId]
  );
  res.json(result.rows);
});

// ── GET USER USAGE ──
router.get('/user/usage', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT plan, monthly_link_count, link_count_reset_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];
    const plan = user.plan || 'free';
    const limits = { free: 15, pro: 200 };
    const limit = limits[plan] || 15;

    res.json({
      plan,
      used: user.monthly_link_count,
      limit,
      remaining: Math.max(0, limit - user.monthly_link_count),
      resets_at: user.link_count_reset_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── UPDATE LINK ──
router.patch('/user/links/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { longUrl, password } = req.body;
  try {
    let updates = [], values = [], idx = 1;
    if (longUrl) { updates.push(`long_url = $${idx++}`); values.push(longUrl); }
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      updates.push(`link_password_hash = $${idx++}`);
      values.push(hash);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No data' });
    values.push(id, req.user.userId);
    const result = await pool.query(
      `UPDATE links SET ${updates.join(', ')} WHERE id = $${idx++}::int AND user_id = $${idx++}::int RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Updated' });
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// ── DELETE LINK ──
router.delete('/user/links/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM links WHERE id = $1::int AND user_id = $2::int RETURNING *',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ── QR CODE ──
router.get('/user/links/:id/qr', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM links WHERE id = $1::int AND user_id = $2::int',
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const link = result.rows[0];
    const shortUrl = `https://${link.domain_name}/${link.custom_alias || link.short_code}`;
    const QRCode = (await import('qrcode')).default;
    const qr = await QRCode.toDataURL(shortUrl);
    res.json({ qr });
  } catch (err) {
    res.status(500).json({ error: 'QR failed' });
  }
});

export default router;
