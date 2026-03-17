// ============================================================
// FILE 3: cron/trialCron.js — NEW FILE
// Drop this in a new folder: xlip.uk/cron/trialCron.js
// This runs daily to send warning emails and downgrade expired trials
//
// Add to index.js:
//   import './cron/trialCron.js';
// ============================================================

import cron from 'node-cron';
import { pool } from '../db.js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'noreply@xlip.uk';

// Runs every day at 9am
cron.schedule('0 9 * * *', async () => {
  console.log('[trialCron] Running trial checks...');

  try {
    // -- SEND WARNING EMAIL — 2 days before trial ends --
    const warningResult = await pool.query(
      `SELECT id, email, trial_ends_at FROM users
       WHERE plan = 'pro'
       AND trial_used = TRUE
       AND trial_ends_at BETWEEN NOW() AND NOW() + INTERVAL '2 days'
       AND trial_warning_sent IS NOT TRUE`
    );

    for (const user of warningResult.rows) {
      const endsDate = new Date(user.trial_ends_at).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric'
      });

      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: 'Your xlip.uk Pro trial ends in 2 days',
        html: `
          <div style="background:#0e1628;color:#cdd8f0;padding:40px;font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#b8d900;font-size:24px;margin-bottom:8px;">xlip<span style="color:white">.uk</span></h2>
            <p style="color:#5a6a85;font-size:13px;margin-bottom:32px;">Fast • Reliable • Secure</p>
            <p style="margin-bottom:16px;">Your 30-day Pro trial ends on <strong style="color:#cdd8f0;">${endsDate}</strong>.</p>
            <p style="margin-bottom:24px; color:#5a6a85;">After that your account will move to the free plan (25 links/month). Upgrade to keep all Pro features.</p>
            <a href="https://xlip.uk/#pricing" style="display:inline-block;background:#b8d900;color:#0e1628;padding:14px 28px;text-decoration:none;font-weight:600;font-size:14px;">Upgrade to Pro ?</a>
            <p style="margin-top:24px; color:#3a4a65; font-size:12px;">Questions? Reply to this email or contact support@xlip.uk</p>
          </div>
        `
      });

      // Mark warning as sent
      await pool.query(
        'UPDATE users SET trial_warning_sent = TRUE WHERE id = $1',
        [user.id]
      );

      console.log(`[trialCron] Warning email sent to ${user.email}`);
    }

    // -- DOWNGRADE EXPIRED TRIALS --
    const expiredResult = await pool.query(
      `UPDATE users SET plan = 'free'
       WHERE plan = 'pro'
       AND trial_used = TRUE
       AND trial_ends_at < NOW()
       RETURNING id, email`
    );

    for (const user of expiredResult.rows) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: user.email,
        subject: 'Your xlip.uk Pro trial has ended',
        html: `
          <div style="background:#0e1628;color:#cdd8f0;padding:40px;font-family:sans-serif;max-width:480px;margin:0 auto;">
            <h2 style="color:#b8d900;font-size:24px;margin-bottom:8px;">xlip<span style="color:white">.uk</span></h2>
            <p style="color:#5a6a85;font-size:13px;margin-bottom:32px;">Fast • Reliable • Secure</p>
            <p style="margin-bottom:16px;">Your 30-day Pro trial has ended. Your account is now on the free plan.</p>
            <p style="margin-bottom:24px; color:#5a6a85; font-size:13px;">
              Free plan includes 25 links/month. Upgrade to Pro to get back all your features — analytics, custom aliases, passwords, QR codes, API access and more.
            </p>
            <a href="https://xlip.uk/#pricing" style="display:inline-block;background:#b8d900;color:#0e1628;padding:14px 28px;text-decoration:none;font-weight:600;font-size:14px;">Upgrade to Pro ?</a>
            <p style="margin-top:24px; color:#3a4a65; font-size:12px;">Can't afford it? Email us at support@xlip.uk — we have vouchers for those who need them.</p>
          </div>
        `
      });

      console.log(`[trialCron] Trial expired and downgraded: ${user.email}`);
    }

    console.log(`[trialCron] Done. Warned: ${warningResult.rows.length}, Downgraded: ${expiredResult.rows.length}`);

  } catch (err) {
    console.error('[trialCron] Error:', err);
  }
});
