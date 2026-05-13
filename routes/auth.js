import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { pool } from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME';
const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'noreply@xlip.uk';
const saltRounds = 10;

// Turnstile verification
async function verifyTurnstile(token, ip) {
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: ip
    })
  });
  const data = await res.json();
  return data.success;
}

// Register
router.post('/register', async (req, res) => {
  return res.status(503).json({ error: 'Registration is temporarily unavailable. Check back soon.' });
  const { email, password, turnstileToken } = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

  // Verify Turnstile
  if (!turnstileToken) return res.status(400).json({ error: 'Security check required.' });
  const turnstileOk = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileOk) return res.status(400).json({ error: 'Security check failed. Please try again.' });

  try {
    const hash = await bcrypt.hash(password, saltRounds);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await pool.query(
      `INSERT INTO users (email, password_hash, verification_code, verification_expires_at, plan, trial_ends_at, trial_used)
       VALUES ($1, $2, $3, $4, 'pro', $5, TRUE)`,
      [email, hash, code, expires, trialEndsAt]
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your xlip.uk verification code',
      html: `
        <div style="background:#0e1628;color:#cdd8f0;padding:40px;font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#b8d900;font-size:24px;margin-bottom:8px;">xlip<span style="color:white">.uk</span></h2>
          <p style="color:#5a6a85;font-size:13px;margin-bottom:32px;">Fast • Reliable • Secure</p>
          <p style="margin-bottom:16px;">Your verification code is:</p>
          <div style="background:#152035;border:1px solid #1e2d47;padding:24px;text-align:center;letter-spacing:0.3em;font-size:32px;font-weight:bold;color:#b8d900;margin-bottom:24px;">
            ${code}
          </div>
          <p style="color:#5a6a85;font-size:12px;">This code expires in 15 minutes. If you didn't register, ignore this email.</p>
        </div>
      `
    });

    res.status(201).json({ message: 'Check your email for your verification code.', email });
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Database error' });
  }
});

// Verify
router.post('/verify', async (req, res) => {
  const { email, code } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.rows[0];
    if (user.is_verified) return res.status(400).json({ error: 'Already verified' });
    if (user.verification_code !== code) return res.status(400).json({ error: 'Invalid code' });
    if (new Date() > new Date(user.verification_expires_at)) return res.status(400).json({ error: 'Code expired' });

    await pool.query(
      'UPDATE users SET is_verified = TRUE, verification_code = NULL, verification_expires_at = NULL WHERE email = $1',
      [email]
    );

    res.json({ message: 'Email verified! You can now login.' });
  } catch (err) {
    console.error('VERIFY ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Resend code
router.post('/resend-code', async (req, res) => {
  const { email } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (result.rows[0].is_verified) return res.status(400).json({ error: 'Already verified' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool.query(
      'UPDATE users SET verification_code = $1, verification_expires_at = $2 WHERE email = $3',
      [code, expires, email]
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: 'Your new xlip.uk verification code',
      html: `
        <div style="background:#0e1628;color:#cdd8f0;padding:40px;font-family:sans-serif;max-width:480px;margin:0 auto;">
          <h2 style="color:#b8d900;font-size:24px;margin-bottom:8px;">xlip<span style="color:white">.uk</span></h2>
          <p style="color:#5a6a85;font-size:13px;margin-bottom:32px;">Fast • Reliable • Secure</p>
          <p style="margin-bottom:16px;">Your new verification code is:</p>
          <div style="background:#152035;border:1px solid #1e2d47;padding:24px;text-align:center;letter-spacing:0.3em;font-size:32px;font-weight:bold;color:#b8d900;margin-bottom:24px;">
            ${code}
          </div>
          <p style="color:#5a6a85;font-size:12px;">This code expires in 15 minutes.</p>
        </div>
      `
    });

    res.json({ message: 'New code sent!' });
  } catch (err) {
    console.error('RESEND CODE ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];

    if (user.is_banned) return res.status(403).json({ error: 'Account suspended. Contact support@xlip.uk' });

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Please verify your email first.', unverified: true, email: user.email });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (match) {
      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ token });
    }
    res.status(401).json({ error: 'Invalid credentials' });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
