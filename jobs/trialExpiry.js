// ============================================================
// xlip.uk — Trial Expiry Job
// File: jobs/trialExpiry.js
//
// Run manually:        node jobs/trialExpiry.js
// Add to index.js:     import './jobs/trialExpiry.js';
// ============================================================

import { pool } from '../db.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ── EMAIL HELPER ──
async function sendEmail(to, subject, html) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'xlip.uk <support@xlip.uk>',
        to,
        subject,
        html
      })
    });

    if (res.ok) {
      console.log(`[Email] ✅ Sent to ${to}: ${subject}`);
    } else {
      console.error(`[Email] ❌ Failed to ${to}:`, await res.text());
    }
  } catch (err) {
    console.error('[Email] Error:', err.message);
  }
}

// ── TRIAL WARNING EMAIL (2 days before expiry) ──
async function sendTrialWarning(email, trialEndsAt) {
  const expiryDate = new Date(trialEndsAt).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  await sendEmail(
    email,
    '⏰ Your xlip.uk Pro trial ends in 2 days',
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0e1628; color: #cdd8f0; padding: 40px;">
      <h1 style="font-family: monospace; color: #b8d900; font-size: 24px; margin-bottom: 4px;">xlip.uk</h1>
      <p style="color: #3a4a65; font-size: 12px; margin-top: 0;">link shortener</p>

      <h2 style="color: #cdd8f0; margin-top: 32px;">Your Pro trial ends on ${expiryDate}</h2>

      <p style="color: #5a6a85; line-height: 1.6;">
        You've been enjoying xlip.uk Pro — 200 links/month, custom aliases, QR codes, analytics and more.
        After ${expiryDate}, your account will move to the free plan (25 links/month).
      </p>

      <div style="background: #152035; border: 1px solid #1e2d47; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 12px; color: #5a6a85; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;">Keep Pro from just</p>
        <p style="margin: 0; color: #b8d900; font-size: 32px; font-family: monospace;">$3<span style="font-size: 14px; color: #5a6a85;">/month</span></p>
        <p style="margin: 8px 0 0; color: #3a4a65; font-size: 12px;">Price based on your region. No hidden fees.</p>
      </div>

      <a href="https://xlip.uk/pricing.html" 
         style="display: inline-block; background: #b8d900; color: #0e1628; padding: 14px 28px; text-decoration: none; font-weight: 500; font-family: sans-serif;">
        Upgrade Now →
      </a>

      <p style="margin-top: 32px; color: #3a4a65; font-size: 12px; line-height: 1.6;">
        If you choose not to upgrade, you'll keep your existing links and data — 
        you just won't be able to create new ones past the free limit.
        <br><br>
        Questions? Reply to this email.
      </p>

      <p style="color: #1e2d47; font-size: 11px; margin-top: 24px;">
        xlip.uk — <a href="https://xlip.uk" style="color: #1e2d47;">xlip.uk</a>
      </p>
    </div>
    `
  );
}

// ── TRIAL EXPIRED EMAIL ──
async function sendTrialExpiredEmail(email) {
  await sendEmail(
    email,
    'Your xlip.uk Pro trial has ended',
    `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #0e1628; color: #cdd8f0; padding: 40px;">
      <h1 style="font-family: monospace; color: #b8d900; font-size: 24px; margin-bottom: 4px;">xlip.uk</h1>
      <p style="color: #3a4a65; font-size: 12px; margin-top: 0;">link shortener</p>

      <h2 style="color: #cdd8f0; margin-top: 32px;">Your Pro trial has ended</h2>

      <p style="color: #5a6a85; line-height: 1.6;">
        Your 30-day Pro trial has ended and your account has moved to the free plan.
        Your existing links are safe — you just have a 25 links/month limit going forward.
      </p>

      <div style="background: #152035; border: 1px solid #1e2d47; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; color: #5a6a85; font-size: 12px;">Want to get Pro back?</p>
        <p style="margin: 0; color: #b8d900; font-size: 28px; font-family: monospace;">From $3<span style="font-size: 14px; color: #5a6a85;">/month</span></p>
      </div>

      <a href="https://xlip.uk/pricing.html"
         style="display: inline-block; background: #b8d900; color: #0e1628; padding: 14px 28px; text-decoration: none; font-weight: 500; font-family: sans-serif;">
        See Pricing →
      </a>

      <p style="margin-top: 32px; color: #3a4a65; font-size: 12px;">
        Thank you for trying xlip.uk Pro. We hope to see you back!
        <br><br>
        Questions? Reply to this email or contact support@xlip.uk
      </p>
    </div>
    `
  );
}

// ============================================================
// MAIN JOB FUNCTION
// ============================================================
export async function runTrialExpiryJob() {
  console.log('[TrialExpiry] Running job at', new Date().toISOString());

  try {
    // ── 1. Send warning to users whose trial ends in ~2 days ──
    const warningResult = await pool.query(`
      SELECT id, email, trial_ends_at
      FROM users
      WHERE plan = 'free'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > NOW()
        AND trial_ends_at <= NOW() + INTERVAL '2 days 1 hour'
        AND trial_warning_sent = false
    `);

    console.log(`[TrialExpiry] ${warningResult.rows.length} users need warning email`);

    for (const user of warningResult.rows) {
      await sendTrialWarning(user.email, user.trial_ends_at);

      await pool.query(
        'UPDATE users SET trial_warning_sent = true WHERE id = $1',
        [user.id]
      );
    }

    // ── 2. Downgrade users whose trial has expired ──
    const expiredResult = await pool.query(`
      SELECT id, email
      FROM users
      WHERE plan = 'pro'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at < NOW()
        AND plan_expires_at IS NULL
    `);

    console.log(`[TrialExpiry] ${expiredResult.rows.length} users to downgrade`);

    for (const user of expiredResult.rows) {
      await pool.query(
        `UPDATE users 
         SET plan = 'free', 
             monthly_link_count = 0,
             link_count_reset_at = NOW()
         WHERE id = $1`,
        [user.id]
      );

      await sendTrialExpiredEmail(user.email);
      console.log(`[TrialExpiry] Downgraded ${user.email} to free`);
    }

    console.log('[TrialExpiry] Job complete!');

  } catch (err) {
    console.error('[TrialExpiry] Error:', err);
  }
}

// ── RUN IMMEDIATELY IF CALLED DIRECTLY ──
runTrialExpiryJob();
