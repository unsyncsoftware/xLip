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
      `SELECT l.*, u.plan FROM links l 
       LEFT JOIN users u ON l.user_id = u.id
       WHERE (l.short_code = $1 OR l.custom_alias = $1) AND l.domain_name = $2`,
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
        const ip = req.ip === '::1' ? '1.1.1.1' : req.ip.replace('::ffff:', '');
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

    // Show interstitial for guest links or free users, redirect instantly for pro/promax
    const isPro = link.plan === 'pro' || link.plan === 'promax';
    if (isPro) {
      return res.redirect(301, link.long_url);
    }

    // Show interstitial page
    return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xlip.uk — Redirecting</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0e1628;
      color: #cdd8f0;
      font-family: 'DM Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      width: 100%;
      max-width: 480px;
      border: 1px solid #1e2d47;
      padding: 40px;
      background: #152035;
    }
    .logo {
      font-family: monospace;
      font-size: 20px;
      color: #b8d900;
      margin-bottom: 32px;
      display: block;
    }
    .logo span { color: #cdd8f0; }
    .label {
      font-size: 10px;
      color: #7a8fa8;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .destination {
      font-size: 13px;
      color: #b8d900;
      word-break: break-all;
      background: #0e1628;
      border: 1px solid #1e2d47;
      padding: 12px 16px;
      margin-bottom: 8px;
      font-family: monospace;
    }
    .safety {
      font-size: 12px;
      color: #4caf50;
      margin-bottom: 28px;
    }
    .btn-continue {
      width: 100%;
      background: #b8d900;
      color: #0e1628;
      border: none;
      padding: 15px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      margin-bottom: 10px;
      transition: background 0.15s;
    }
    .btn-continue:hover { background: #9ab800; }
    .btn-report {
      width: 100%;
      background: transparent;
      color: #7a8fa8;
      border: 1px solid #1e2d47;
      padding: 12px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-report:hover { border-color: #e05a5a; color: #e05a5a; }
    .reported { font-size: 13px; color: #4caf50; text-align: center; margin-top: 12px; display: none; }
    .footer-note {
      font-size: 11px;
      color: #3a4a65;
      text-align: center;
      margin-top: 24px;
    }
    .footer-note a { color: #5a6a85; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <span class="logo">xlip<span>.uk</span></span>
    <div class="label">You are being redirected to</div>
    <div class="destination">${link.long_url}</div>
    <div class="safety">🛡️ Checked by Google Safe Browsing</div>
    <button class="btn-continue" onclick="window.location.href='${link.long_url}'">Continue →</button>
    <button class="btn-report" onclick="reportLink()">🚩 Report this link</button>
    <div class="reported" id="reported">✓ Reported. Thank you for keeping xlip safe.</div>
    <div class="footer-note">Short link by <a href="https://xlip.uk">xlip.uk</a> — <a href="https://xlip.uk/support.html">help</a></div>
  </div>
  <script>
    async function reportLink() {
      try {
        await fetch('/api/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            shortCode: '${code}',
            longUrl: '${link.long_url}',
            linkId: ${link.id}
          })
        });
        document.querySelector('.btn-report').style.display = 'none';
        document.getElementById('reported').style.display = 'block';
      } catch {
        alert('Failed to report. Please try again.');
      }
    }
  </script>
</body>
</html>`);

  } catch (err) {
    console.error('REDIRECT ERROR:', err);
    res.status(500).send('Error');
  }
});

export default router;