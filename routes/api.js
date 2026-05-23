// ============================================================
// xlip.uk — Public API v1 (updated with usage limits)
// File: routes/api.js (full replacement)
// ============================================================

import express from 'express';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/jwt.js';
import { incrementLinkCount } from '../middleware/checkLimit.js';

const router = express.Router();

async function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Missing API key. Include x-api-key in your request headers.' });

  try {
    const result = await pool.query(
      'SELECT id, email, is_banned, plan, monthly_link_count, link_count_reset_at FROM users WHERE api_key = $1',
      [apiKey]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid API key.' });

    const user = result.rows[0];
    if (user.is_banned) return res.status(403).json({ error: 'Your account has been banned.' });

    req.apiUser = user;
    next();
  } catch (err) {
    console.error('API key auth error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

async function checkApiLimit(req, res, next) {
  const user = req.apiUser;
  const plan = user.plan || 'free';
  const limits = { free: 15, pro: 200 };
  const limit = limits[plan] || 15;

  const resetAt = new Date(user.link_count_reset_at);
  const now = new Date();
  const monthsSinceReset =
    (now.getFullYear() - resetAt.getFullYear()) * 12 +
    (now.getMonth() - resetAt.getMonth());

  let currentCount = user.monthly_link_count;

  if (monthsSinceReset >= 1) {
    await pool.query('UPDATE users SET monthly_link_count = 0, link_count_reset_at = NOW() WHERE id = $1', [user.id]);
    currentCount = 0;
  }

  if (currentCount >= limit) {
    return res.status(429).json({
      error: plan === 'free'
        ? `Free accounts can shorten ${limit} links/month. Upgrade to Pro for 200 links/month.`
        : `You have reached your Pro limit of ${limit} links/month.`,
      limit, used: currentCount, plan,
      upgrade_url: 'https://xlip.uk/#pricing'
    });
  }

  req.limitInfo = { userId: user.id, plan, limit, used: currentCount };
  next();
}

// POST /api/v1/auth/generate-key
router.post('/auth/generate-key', authenticateToken, async (req, res) => {
  try {
    const apiKey = 'xlip_' + crypto.randomBytes(32).toString('hex');
    await pool.query('UPDATE users SET api_key = $1 WHERE id = $2', [apiKey, req.user.userId]);
    res.json({ success: true, api_key: apiKey, message: 'Store this key safely. Regenerating it will invalidate the old one.' });
  } catch (err) {
    console.error('Generate key error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/v1/shorten
router.post('/shorten', requireApiKey, checkApiLimit, async (req, res) => {
  const { url, customAlias } = req.body;
  const domainName = req.get('host');

  if (!url) return res.status(400).json({ error: 'url is required.' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL format.' }); }

  try {
    if (customAlias) {
      const exists = await pool.query(
        'SELECT 1 FROM links WHERE custom_alias = $1 AND domain_name = $2',
        [customAlias, domainName]
      );
      if (exists.rows.length) return res.status(409).json({ error: 'Alias already taken. Try another.' });
    }

    const shortCode = nanoid(6);
    await pool.query(
      `INSERT INTO links (long_url, short_code, custom_alias, user_id, domain_name) VALUES ($1, $2, $3, $4, $5)`,
      [url, shortCode, customAlias || null, req.apiUser.id, domainName]
    );

    await incrementLinkCount(req.apiUser.id);
    const slug = customAlias || shortCode;

    res.status(201).json({
      success: true,
      short_url: `https://${domainName}/${slug}`,
      short_code: shortCode,
      custom_alias: customAlias || null,
      original_url: url,
      usage: {
        used: req.limitInfo.used + 1,
        limit: req.limitInfo.limit,
        remaining: req.limitInfo.limit - req.limitInfo.used - 1,
        plan: req.limitInfo.plan
      }
    });
  } catch (err) {
    console.error('Shorten error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/v1/stats/:code
router.get('/stats/:code', requireApiKey, async (req, res) => {
  try {
    const linkResult = await pool.query(
      `SELECT l.id, l.short_code, l.custom_alias, l.long_url, l.created_at, l.expires_at, l.domain_name,
              COUNT(a.id) AS total_clicks
       FROM links l LEFT JOIN analytics a ON a.link_id = l.id
       WHERE (l.short_code = $1 OR l.custom_alias = $1) AND l.user_id = $2
       GROUP BY l.id`,
      [req.params.code, req.apiUser.id]
    );
    if (linkResult.rows.length === 0) return res.status(404).json({ error: 'Link not found or does not belong to you.' });

    const link = linkResult.rows[0];
    res.json({
      success: true,
      short_url: `https://${link.domain_name}/${link.custom_alias || link.short_code}`,
      original_url: link.long_url,
      created_at: link.created_at,
      expires_at: link.expires_at,
      total_clicks: parseInt(link.total_clicks)
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/v1/links
router.get('/links', requireApiKey, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  try {
    const result = await pool.query(
      `SELECT l.id, l.short_code, l.custom_alias, l.long_url, l.created_at, l.expires_at, l.domain_name,
              COUNT(a.id) AS total_clicks
       FROM links l LEFT JOIN analytics a ON a.link_id = l.id
       WHERE l.user_id = $1
       GROUP BY l.id ORDER BY l.created_at DESC LIMIT $2 OFFSET $3`,
      [req.apiUser.id, limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*) AS total FROM links WHERE user_id = $1', [req.apiUser.id]);
    const total = parseInt(countResult.rows[0].total);

    res.json({
      success: true,
      links: result.rows.map(l => ({
        id: l.id,
        short_url: `https://${l.domain_name}/${l.custom_alias || l.short_code}`,
        short_code: l.short_code,
        custom_alias: l.custom_alias,
        original_url: l.long_url,
        created_at: l.created_at,
        expires_at: l.expires_at,
        total_clicks: parseInt(l.total_clicks)
      })),
      pagination: { page, limit, total, total_pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List links error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/v1/links/:code
router.delete('/links/:code', requireApiKey, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM links WHERE (short_code = $1 OR custom_alias = $1) AND user_id = $2 RETURNING id`,
      [req.params.code, req.apiUser.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Link not found or does not belong to you.' });
    res.json({ success: true, message: 'Link deleted successfully.' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/v1/ping
router.get('/ping', (req, res) => {
  res.json({ success: true, message: 'xlip.uk API is alive 🚀', version: 'v1' });
});

// POST /api/v1/unshorten
router.options('/unshorten', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

router.post('/unshorten', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
}, async (req, res) => {
  const { url } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  if (!url) return res.status(400).json({ error: 'URL is required.' });
  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }

  // Rate limit — 5 checks per hour per IP for guests
  try {
    const recentChecks = await pool.query(
      `SELECT COUNT(*) FROM visitor_logs 
       WHERE action = 'link_checked' 
       AND ip_address = $1 
       AND created_at > NOW() - INTERVAL '24 hour'`,
      [ip]
    );
    if (parseInt(recentChecks.rows[0].count) >= 5) {
      return res.status(429).json({ error: 'Daily check limit reached. Sign up for more checks.' });
    }
  } catch (err) {
    console.error('Rate limit check error:', err);
  }

  try {
    // Follow redirects to get final URL
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'xlip.uk Link Checker/1.0' }
    });
    const finalUrl = response.url;

    // Check against Google Safe Browsing
    const sbRes = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${process.env.GOOGLE_SAFE_BROWSING_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'xlip.uk', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: finalUrl }, { url: url }]
        }
      })
    });
    const sbData = await sbRes.json();
    const isSafe = !sbData.matches || sbData.matches.length === 0;
    const threat = isSafe ? null : sbData.matches[0].threatType;

    // Log the check
    pool.query(
      'INSERT INTO visitor_logs (ip_address, action, detail) VALUES ($1, $2, $3)',
      [ip, 'link_checked', url]
    ).catch(() => {});

    res.json({ success: true, originalUrl: url, finalUrl, isSafe, threat });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(408).json({ error: 'Link took too long to respond.' });
    }
    console.error('Unshorten error:', err);
    res.status(500).json({ error: 'Could not check this link.' });
  }
});

export default router;
