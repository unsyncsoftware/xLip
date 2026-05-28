import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../middleware/jwt.js';
import { upload } from '../middleware/upload.js';
import { logVisit } from '../middleware/logger.js';
import { validatePublicHttpUrl } from '../lib/security.js';

const router = express.Router();

const RESERVED = ['api', 'admin', 'bio', 'login', 'register', 'support', 'about', 'legal', 'privacy', 'donate', 'images', 'uploads'];
const SOCIAL_HANDLE_RE = /^[a-zA-Z0-9_.@-]{0,100}$/;

// Check username availability
router.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) return res.json({ available: false, reason: 'invalid' });
  if (RESERVED.includes(username.toLowerCase())) return res.json({ available: false });
  const result = await pool.query('SELECT 1 FROM bio_profiles WHERE username = $1', [username]);
  res.json({ available: result.rows.length === 0 });
});

// Get own profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const profile = await pool.query('SELECT * FROM bio_profiles WHERE user_id = $1', [req.user.userId]);
    if (profile.rows.length === 0) return res.json(null);
    const links = await pool.query(
      'SELECT * FROM bio_links WHERE profile_id = $1 ORDER BY display_order ASC',
      [profile.rows[0].id]
    );
    res.json({ ...profile.rows[0], links: links.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create or update profile
router.post('/profile', authenticateToken, async (req, res) => {
  const { username, display_name, bio, accent_color, instagram, twitter, tiktok, youtube, facebook } = req.body;
  if (!username) return res.status(400).json({ error: 'Username is required' });
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) return res.status(400).json({ error: 'Invalid username format' });
  if (RESERVED.includes(username.toLowerCase())) return res.status(400).json({ error: 'That username is reserved' });
  if (display_name && display_name.length > 60) return res.status(400).json({ error: 'Display name too long' });
  if (bio && bio.length > 500) return res.status(400).json({ error: 'Bio too long' });
  if (accent_color && !/^#[0-9a-fA-F]{6}$/.test(accent_color)) return res.status(400).json({ error: 'Invalid accent color' });
  if ([instagram, twitter, tiktok, youtube, facebook].some(v => v && !SOCIAL_HANDLE_RE.test(v))) {
    return res.status(400).json({ error: 'Invalid social handle' });
  }

  try {
    const existing = await pool.query('SELECT * FROM bio_profiles WHERE user_id = $1', [req.user.userId]);
    if (existing.rows.length === 0) {
      const result = await pool.query(
        `INSERT INTO bio_profiles (user_id, username, display_name, bio, accent_color, instagram, twitter, tiktok, youtube, facebook)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.user.userId, username, display_name, bio, accent_color || '#b8d900', instagram, twitter, tiktok, youtube, facebook]
      );
      res.status(201).json(result.rows[0]);
    } else {
      const result = await pool.query(
        `UPDATE bio_profiles SET username=$1, display_name=$2, bio=$3, accent_color=$4,
         instagram=$5, twitter=$6, tiktok=$7, youtube=$8, facebook=$9, updated_at=NOW()
         WHERE user_id=$10 RETURNING *`,
        [username, display_name, bio, accent_color || '#b8d900', instagram, twitter, tiktok, youtube, facebook, req.user.userId]
      );
      res.json(result.rows[0]);
    }
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload avatar
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE bio_profiles SET avatar_url = $1 WHERE user_id = $2', [avatarUrl, req.user.userId]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Add bio link
router.post('/links', authenticateToken, upload.single('image'), async (req, res) => {
  const { title, url } = req.body;
  if (!title || !url) return res.status(400).json({ error: 'Title and URL are required' });
  if (title.length > 100) return res.status(400).json({ error: 'Title too long' });
  const urlValidation = validatePublicHttpUrl(url);
  if (!urlValidation.ok) return res.status(400).json({ error: urlValidation.error });

  try {
    const profile = await pool.query('SELECT id FROM bio_profiles WHERE user_id = $1', [req.user.userId]);
    if (profile.rows.length === 0) return res.status(404).json({ error: 'Create a bio profile first' });
    const profileId = profile.rows[0].id;
    const imageUrl = req.file ? `/uploads/bio-images/${req.file.filename}` : null;
    const orderResult = await pool.query(
      'SELECT COALESCE(MAX(display_order), 0) + 1 AS next_order FROM bio_links WHERE profile_id = $1',
      [profileId]
    );
    const result = await pool.query(
      `INSERT INTO bio_links (profile_id, title, url, image_url, display_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [profileId, title, urlValidation.url, imageUrl, orderResult.rows[0].next_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Update bio link
router.patch('/links/:id', authenticateToken, upload.single('image'), async (req, res) => {
  const { title, url, display_order, is_active } = req.body;
  try {
    const check = await pool.query(
      `SELECT bl.* FROM bio_links bl JOIN bio_profiles bp ON bl.profile_id = bp.id WHERE bl.id = $1 AND bp.user_id = $2`,
      [req.params.id, req.user.userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Link not found' });

    let updates = [], values = [], idx = 1;
    if (title) {
      if (title.length > 100) return res.status(400).json({ error: 'Title too long' });
      updates.push(`title = $${idx++}`);
      values.push(title);
    }
    if (url) {
      const urlValidation = validatePublicHttpUrl(url);
      if (!urlValidation.ok) return res.status(400).json({ error: urlValidation.error });
      updates.push(`url = $${idx++}`);
      values.push(urlValidation.url);
    }
    if (display_order !== undefined) { updates.push(`display_order = $${idx++}`); values.push(display_order); }
    if (is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(is_active); }
    if (req.file) { updates.push(`image_url = $${idx++}`); values.push(`/uploads/bio-images/${req.file.filename}`); }
    if (updates.length === 0) return res.status(400).json({ error: 'No data' });

    values.push(req.params.id);
    const result = await pool.query(`UPDATE bio_links SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// Delete bio link
router.delete('/links/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM bio_links bl USING bio_profiles bp
       WHERE bl.profile_id = bp.id AND bl.id = $1 AND bp.user_id = $2 RETURNING bl.*`,
      [req.params.id, req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Track click + redirect
router.get('/click/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE bio_links SET clicks = clicks + 1 WHERE id = $1 RETURNING url',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).send('Not found');
    const destination = validatePublicHttpUrl(result.rows[0].url);
    if (!destination.ok) return res.status(400).send('Unsafe destination');
    res.redirect(302, destination.url);
  } catch (err) {
    res.status(500).send('Error');
  }
});

// Public bio page data
router.get('/:username', logVisit('bio_viewed'), async (req, res) => {
  try {
    const profile = await pool.query('SELECT * FROM bio_profiles WHERE username = $1', [req.params.username]);
    if (profile.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    const links = await pool.query(
      'SELECT * FROM bio_links WHERE profile_id = $1 AND is_active = TRUE ORDER BY display_order ASC',
      [profile.rows[0].id]
    );
    const { user_id, ...publicProfile } = profile.rows[0];
    res.json({ ...publicProfile, links: links.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
