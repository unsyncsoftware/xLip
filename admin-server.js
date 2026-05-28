import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { exec } from 'child_process';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { pool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'CHANGE_ME' || JWT_SECRET.length < 32) {
  throw new Error('ADMIN_JWT_SECRET or JWT_SECRET must be set to a strong secret of at least 32 characters');
}

const adminLoginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts. Try again later.' }
});

const adminAuth = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (!user.is_admin) return res.status(403).json({ error: 'Not admin' });
    req.user = user;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid token' });
  }
};

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  next();
});
app.use(express.static(path.join(__dirname, 'public/race-control-hidden')));

// ── LOGIN ──
app.post('/api/admin/login', adminLoginLimit, async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (match && user.is_admin) {
      const token = jwt.sign(
        { userId: user.id, email: user.email, is_admin: true },
        JWT_SECRET,
        { expiresIn: '8h' }
      );
      res.json({ success: true, token });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD STATS ──
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const userCount   = await pool.query('SELECT COUNT(*) FROM users');
    const linkCount   = await pool.query('SELECT COUNT(*) FROM links');
    const clickCount  = await pool.query('SELECT COUNT(*) FROM analytics');
    const bioCount    = await pool.query('SELECT COUNT(*) FROM bio_profiles');
    const subCount    = await pool.query('SELECT COUNT(*) FROM subdomains');
    const todayClicks = await pool.query(`SELECT COUNT(*) FROM analytics WHERE clicked_at >= NOW() - INTERVAL '24 hours'`);
    const abuseCount  = await pool.query(`SELECT COUNT(*) FROM abuse_reports WHERE status = 'pending'`);

    const linksRes = await pool.query(`
      SELECT l.id, u.email AS owner_email, l.custom_alias, l.short_code, l.long_url, l.domain_name, l.created_at,
        (SELECT COUNT(*) FROM analytics a WHERE a.link_id = l.id) AS clicks
      FROM links l
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY l.id DESC LIMIT 200
    `);

    res.json({
      stats: {
        total_users:   userCount.rows[0].count,
        total_links:   linkCount.rows[0].count,
        total_clicks:  clickCount.rows[0].count,
        today_clicks:  todayClicks.rows[0].count,
        total_bios:    bioCount.rows[0].count,
        total_subs:    subCount.rows[0].count,
        pending_abuse: abuseCount.rows[0].count,
      },
      links: linksRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// ── ALL USERS ──
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.is_admin, u.is_verified, u.is_banned, u.plan,
        u.trial_ends_at, u.created_at,
        bp.username AS bio_username,
        s.subdomain,
        COUNT(l.id) AS link_count
      FROM users u
      LEFT JOIN bio_profiles bp ON bp.user_id = u.id
      LEFT JOIN subdomains s ON s.user_id = u.id
      LEFT JOIN links l ON l.user_id = u.id
      GROUP BY u.id, bp.username, s.subdomain
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CLIENT PROFILE ──
app.get('/api/admin/client/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

    const links = await pool.query(`
      SELECT l.*, COUNT(a.id) AS clicks
      FROM links l
      LEFT JOIN analytics a ON a.link_id = l.id
      WHERE l.user_id = $1
      GROUP BY l.id
      ORDER BY l.created_at DESC
    `, [id]);

    const analytics = await pool.query(`
      SELECT a.country, a.city, COUNT(*) AS clicks
      FROM analytics a
      JOIN links l ON a.link_id = l.id
      WHERE l.user_id = $1 AND a.country IS NOT NULL
      GROUP BY a.country, a.city
      ORDER BY clicks DESC
      LIMIT 20
    `, [id]);

    const bio = await pool.query('SELECT * FROM bio_profiles WHERE user_id = $1', [id]);

    const abuse = await pool.query(`
      SELECT ar.* FROM abuse_reports ar
      JOIN links l ON ar.link_id = l.id
      WHERE l.user_id = $1
      ORDER BY ar.reported_at DESC
    `, [id]);

    const activity = await pool.query(`
      SELECT * FROM visitor_logs
      WHERE ip_address IN (
        SELECT DISTINCT ip_address FROM analytics
        JOIN links ON analytics.link_id = links.id
        WHERE links.user_id = $1
      )
      ORDER BY created_at DESC LIMIT 50
    `, [id]);

    res.json({
      user: user.rows[0],
      links: links.rows,
      analytics: analytics.rows,
      bio: bio.rows[0] || null,
      abuse: abuse.rows,
      activity: activity.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE CLIENT ──
app.delete('/api/admin/client/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── CHANGE PLAN ──
app.patch('/api/admin/client/:id/plan', adminAuth, async (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro', 'promax'].includes(plan)) return res.status(400).json({ error: 'Invalid plan' });
  try {
    await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BAN / UNBAN ──
app.patch('/api/admin/users/:id/ban', adminAuth, async (req, res) => {
  const { banned } = req.body;
  try {
    await pool.query('UPDATE users SET is_banned = $1 WHERE id = $2', [banned, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ALL BIO PROFILES ──
app.get('/api/admin/bios', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT bp.id, bp.username, bp.display_name, bp.accent_color, bp.created_at,
        u.email AS owner_email, COUNT(bl.id) AS link_count
      FROM bio_profiles bp
      JOIN users u ON bp.user_id = u.id
      LEFT JOIN bio_links bl ON bl.profile_id = bp.id
      GROUP BY bp.id, u.email
      ORDER BY bp.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VISITOR LOGS ──
app.get('/api/admin/visitors', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ip_address, action, detail, created_at
      FROM visitor_logs ORDER BY created_at DESC LIMIT 500
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ABUSE REPORTS ──
app.get('/api/admin/abuse-reports', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ar.*, u.email AS owner_email
      FROM abuse_reports ar
      LEFT JOIN links l ON ar.link_id = l.id
      LEFT JOIN users u ON l.user_id = u.id
      ORDER BY ar.reported_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE ABUSE REPORT STATUS ──
app.patch('/api/admin/abuse-reports/:id', adminAuth, async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'reviewed', 'nuked'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  try {
    await pool.query('UPDATE abuse_reports SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BLOCKED URLS ──
app.get('/api/admin/blocked-urls', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ip_address, detail AS url, created_at
      FROM visitor_logs
      WHERE action = 'url_blocked'
      ORDER BY created_at DESC LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SETTINGS ──
app.get('/api/admin/settings', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM settings');
    const settings = {};
    result.rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/settings', adminAuth, async (req, res) => {
  const { key, value } = req.body;
  try {
    await pool.query(`
      INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, value]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SERVER HEALTH ──
app.get('/api/admin/status', adminAuth, (req, res) => {
  exec('free -m | grep Mem', (err, stdout) => {
    if (err) return res.status(500).json({ error: 'Failed to read RAM' });
    const parts = stdout.trim().split(/\s+/);
    exec('df -h / | tail -1', (err2, stdout2) => {
      const disk = stdout2 ? stdout2.trim().split(/\s+/) : [];
      res.json({
        ram_total: parts[1] + 'MB',
        ram_used:  parts[2] + 'MB',
        ram_free:  parts[3] + 'MB',
        disk_used: disk[2] || '--',
        disk_free: disk[3] || '--',
        disk_pct:  disk[4] || '--',
        uptime:    process.uptime().toFixed(0) + 's'
      });
    });
  });
});

// ── SERVICE CONTROL ──
app.post('/api/admin/restart/:service', adminAuth, (req, res) => {
  const { service } = req.params;
  if (['xlip-app', 'xlip-admin'].includes(service)) {
    exec(`pm2 restart ${service}`, (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, message: `${service} restarted!` });
    });
  } else {
    res.status(403).json({ error: 'Invalid service' });
  }
});

// ── NUKE LINK ──
app.delete('/api/admin/nuke/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM links WHERE id = $1::int', [req.params.id]);
    res.json({ message: 'Link deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

// ── DELETE BIO PROFILE ──
app.delete('/api/admin/bios/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM bio_profiles WHERE id = $1::int', [req.params.id]);
    res.json({ message: 'Bio profile deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bio' });
  }
});

const PORT = 8888;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`xlip Admin Panel active on port ${PORT}`);
});
