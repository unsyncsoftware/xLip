// ============================================================
// xlip.uk — PayPal Webhook Handler
// File: routes/webhooks.js
//
// Add to index.js:
//   import webhookRoutes from './routes/webhooks.js';
//   app.use('/webhooks', webhookRoutes);
// ============================================================

import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

// ── PLAN CONFIG ──
const PLAN_DURATION_DAYS = 30;

const PAYPAL_LINK_PLAN_MAP = {
  // Pro links
  'NZ6DFZLRGRT7C': 'pro', // Tier 1 $8
  'U2J5KQW3WSZYN': 'pro', // Tier 2 $5
  'ZN99LDTAEKBLS': 'pro', // Tier 3 $3
  // Business links
  '8ZY86SENMFSES': 'business', // Tier 1 $15
  'MESUVJW7WDNUJ': 'business', // Tier 2 $10
  'Z67KRZHFS425U': 'business', // Tier 3 $8
};

// ============================================================
// POST /webhooks/paypal
// Receives PayPal IPN or webhook notification
// ============================================================
router.post('/paypal', express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const body = req.body;

    // Log for debugging
    console.log('[PayPal Webhook]', JSON.stringify(body, null, 2));

    // PayPal IPN sends payment_status
    const paymentStatus = body.payment_status;
    const customField = body.custom; // This is where we pass user ID
    const paypalLinkId = body.item_number || body.button_id || '';

    // Only process completed payments
    if (paymentStatus !== 'Completed') {
      console.log('[PayPal Webhook] Skipping non-completed payment:', paymentStatus);
      return res.status(200).send('OK');
    }

    // Parse user ID from custom field
    // Format we send: "uid_123" where 123 is the user ID
    if (!customField || !customField.startsWith('uid_')) {
      console.log('[PayPal Webhook] Missing or invalid custom field:', customField);
      return res.status(200).send('OK');
    }

    const userId = parseInt(customField.replace('uid_', ''));
    if (isNaN(userId)) {
      console.log('[PayPal Webhook] Invalid user ID:', customField);
      return res.status(200).send('OK');
    }

    // Determine plan from PayPal link ID
    // Extract link ID from the payment link
    let plan = 'pro'; // default
    for (const [linkId, linkPlan] of Object.entries(PAYPAL_LINK_PLAN_MAP)) {
      if (paypalLinkId.includes(linkId) || (body.invoice_id || '').includes(linkId)) {
        plan = linkPlan;
        break;
      }
    }

    // Calculate plan expiry
    const planExpiresAt = new Date();
    planExpiresAt.setDate(planExpiresAt.getDate() + PLAN_DURATION_DAYS);

    // Upgrade user in database
    const result = await pool.query(
      `UPDATE users 
       SET plan = $1, 
           plan_expires_at = $2,
           monthly_link_count = 0,
           link_count_reset_at = NOW()
       WHERE id = $3 
       RETURNING email, plan`,
      [plan, planExpiresAt, userId]
    );

    if (result.rows.length === 0) {
      console.log('[PayPal Webhook] User not found:', userId);
      return res.status(200).send('OK');
    }

    const user = result.rows[0];
    console.log(`[PayPal Webhook] ✅ Upgraded user ${user.email} to ${plan} until ${planExpiresAt}`);

    // Send upgrade confirmation email
    await sendUpgradeEmail(user.email, plan, planExpiresAt);

    res.status(200).send('OK');

  } catch (err) {
    console.error('[PayPal Webhook] Error:', err);
    res.status(200).send('OK'); // Always return 200 to PayPal
  }
});

// ============================================================
// POST /webhooks/paypal-test
// Test endpoint to manually trigger an upgrade (dev only)
// Remove in production!
// ============================================================
router.post('/paypal-test', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { userId, plan } = req.body;

  try {
    const planExpiresAt = new Date();
    planExpiresAt.setDate(planExpiresAt.getDate() + 30);

    const result = await pool.query(
      `UPDATE users 
       SET plan = $1, 
           plan_expires_at = $2
       WHERE id = $3 
       RETURNING email, plan`,
      [plan || 'pro', planExpiresAt, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true, user: result.rows[0], expires: planExpiresAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// HELPER — Send upgrade confirmation email via Resend
// ============================================================
async function sendUpgradeEmail(email, plan, expiresAt) {
  try {
    const planName = plan === 'business' ? 'Business' : 'Pro';
    const expiryDate = expiresAt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'xlip.uk <support@xlip.uk>',
        to: email,
        subject: `🎉 You're now on xlip.uk ${planName}!`,
        html: `
          <div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; background: #0e1628; color: #cdd8f0; padding: 40px;">
            <h1 style="font-family: monospace; color: #b8d900; font-size: 24px;">xlip.uk</h1>
            <h2 style="color: #cdd8f0;">You're now on ${planName}! 🎉</h2>
            <p style="color: #5a6a85;">Your payment was received and your account has been upgraded.</p>
            
            <div style="background: #152035; border: 1px solid #1e2d47; padding: 20px; margin: 24px 0;">
              <p style="margin: 0; color: #5a6a85; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Plan</p>
              <p style="margin: 4px 0 0; color: #b8d900; font-size: 20px; font-family: monospace;">${planName}</p>
              <p style="margin: 16px 0 0; color: #5a6a85; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em;">Active Until</p>
              <p style="margin: 4px 0 0; color: #cdd8f0;">${expiryDate}</p>
            </div>

            <p style="color: #5a6a85;">Log in to your dashboard to start using your ${planName} features.</p>
            
            <a href="https://xlip.uk" style="display: inline-block; background: #b8d900; color: #0e1628; padding: 14px 28px; text-decoration: none; font-weight: 500; margin-top: 8px;">Go to Dashboard →</a>
            
            <p style="margin-top: 32px; color: #3a4a65; font-size: 12px;">Questions? Reply to this email or contact support@xlip.uk</p>
          </div>
        `
      })
    });

    if (response.ok) {
      console.log(`[Email] ✅ Upgrade email sent to ${email}`);
    } else {
      console.error(`[Email] ❌ Failed to send upgrade email:`, await response.text());
    }
  } catch (err) {
    console.error('[Email] Error sending upgrade email:', err);
  }
}

export default router;
