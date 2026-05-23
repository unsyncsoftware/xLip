import express from 'express';
import { pool } from '../db.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
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

    await resend.emails.send({
      from: 'noreply@xlip.uk',
      to: 'support@xlip.uk',
      subject: `🚩 Link reported: xlip.uk/${shortCode}`,
      html: `
        <div style="font-family:sans-serif;background:#0e1628;color:#cdd8f0;padding:40px;">
          <h2 style="color:#e05a5a;">🚩 Abuse Report</h2>
          <p><strong>Short code:</strong> xlip.uk/${shortCode}</p>
          <p><strong>Destination:</strong> ${longUrl}</p>
          <p><strong>Reporter IP:</strong> ${ip}</p>
        </div>
      `
    });

    res.json({ success: true });
  } catch (err) {
    console.error('REPORT ERROR:', err);
    res.status(500).json({ error: 'Failed to submit report.' });
  }
});

export default router;