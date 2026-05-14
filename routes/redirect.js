import express from 'express';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

router.get('/:code', async (req, res) => {
  const { code } = req.params;
  const host = req.get('host');

  if (['favicon.ico', 'api', 'assets', 'bio'].includes(code) || code.includes('.')) return;

  // Check if it's a bio profile username first
  try {
    const bioProfile = await pool.query('SELECT username FROM bio_profiles WHERE username = $1', [code]);
    if (bioProfile.rows.length > 0) {
      return res.sendFile(path.join(__dirname, '../public/bio.html'));
    }
  } catch (err) {
    console.error('BIO CHECK ERROR:', err);
  }

  // Otherwise treat as short link
  try {
    const result = await pool.query(
      `SELECT * FROM links WHERE (short_code = $1 OR custom_alias = $1) AND domain_name = $2`,
      [code, host]
    );
    if (!result.rows.length) return res.status(404).send('Not found');

    const link = result.rows[0];
    if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).send('Expired');

    if (link.link_password_hash) {
      const submitted = req.query.p;
      const match = submitted ? await bcrypt.compare(submitted, link.link_password_hash) : false;
      if (!match) {
        return res.send(`
          <body style="background:#0e1628;color:white;text-align:center;padding-top:100px;font-family:sans-serif;">
            <h2 style="color:#b8d900">Password Protected</h2>
            <input id="pw" type="password" style="padding:10px;border:1px solid #1e2d47;background:#152035;color:white;margin-top:16px;">
            <button onclick="window.location.href=window.location.pathname+'?p='+document.getElementById('pw').value"
              style="display:block;margin:12px auto;background:#b8d900;color:#0e1628;border:none;padding:10px 24px;cursor:pointer;font-weight:bold;">
              Unlock
            </button>
            ${submitted ? '<p style="color:#e05a5a">Wrong password</p>' : ''}
          </body>`);
      }
    }
    
    // Log the click with geolocation
    (async () => {
      try {
        const ip = req.ip === '::1' ? '1.1.1.1' : req.ip;
        const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,city,status`);
        const geoData = await geo.json();
        const country = geoData.status === 'success' ? geoData.country : null;
        const city = geoData.status === 'success' ? geoData.city : null;
        pool.query(
          'INSERT INTO analytics (link_id, ip_address, country, city) VALUES ($1,$2,$3,$4)',
          [link.id, req.ip, country, city]
        ).catch(() => {});
      } catch {
        pool.query('INSERT INTO analytics (link_id, ip_address) VALUES ($1,$2)', [link.id, req.ip]).catch(() => {});
      }
    })();
        
    pool.query('INSERT INTO visitor_logs (ip_address, action, detail) VALUES ($1,$2,$3)',
      [req.ip, 'link_clicked', `/${code}`]).catch(() => {});

    res.setHeader('X-Robots-Tag', 'noindex');
    res.redirect(301, link.long_url);
  } catch (err) {
    console.error('REDIRECT ERROR:', err);
    res.status(500).send('Error');
  }
});

export default router;
