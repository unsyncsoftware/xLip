// ============================================================
// FILE 2: middleware/checkLimit.js — FULL REPLACEMENT
// ============================================================

import { pool } from '../db.js';

const LIMITS = {
  free: 25,
  pro: 200,
  business: 1000
};

export const checkLimit = async (req, res, next) => {
  if (!req.user) return next();

  const userId = req.user.userId || req.apiUser?.id;
  if (!userId) return next();

  try {
    const result = await pool.query(
      'SELECT plan, monthly_link_count, link_count_reset_at, trial_ends_at, trial_used FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });

    const user = result.rows[0];
    let plan = user.plan || 'free';

    // -- CHECK TRIAL EXPIRY --
    if (plan === 'pro' && user.trial_used && user.trial_ends_at) {
      const now = new Date();
      const trialEnd = new Date(user.trial_ends_at);

      if (now > trialEnd) {
        // Trial expired — downgrade to free
        await pool.query(
          'UPDATE users SET plan = $1 WHERE id = $2',
          ['free', userId]
        );
        plan = 'free';

        // Notify the response that trial just expired
        req.trialJustExpired = true;
      }
    }

    const limit = LIMITS[plan] || LIMITS.free;
    const resetAt = new Date(user.link_count_reset_at);
    const now = new Date();

    // -- RESET MONTHLY COUNT IF NEEDED --
    const monthsSinceReset =
      (now.getFullYear() - resetAt.getFullYear()) * 12 +
      (now.getMonth() - resetAt.getMonth());

    if (monthsSinceReset >= 1) {
      await pool.query(
        'UPDATE users SET monthly_link_count = 0, link_count_reset_at = NOW() WHERE id = $1',
        [userId]
      );
      user.monthly_link_count = 0;
    }

    // -- CHECK LIMIT --
    if (user.monthly_link_count >= limit) {
      const upgradeMsg = plan === 'free'
        ? `Free accounts can shorten ${limit} links/month. Upgrade to Pro to get more.`
        : `You have reached your ${plan} limit of ${limit} links/month.`;

      return res.status(429).json({
        error: upgradeMsg,
        limit,
        used: user.monthly_link_count,
        plan,
        trial_expired: req.trialJustExpired || false,
        upgrade_url: 'https://xlip.uk/#pricing'
      });
    }

    req.limitInfo = { userId, plan, limit, used: user.monthly_link_count };
    next();

  } catch (err) {
    console.error('checkLimit error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

export const incrementLinkCount = async (userId) => {
  try {
    await pool.query(
      'UPDATE users SET monthly_link_count = monthly_link_count + 1 WHERE id = $1',
      [userId]
    );
  } catch (err) {
    console.error('incrementLinkCount error:', err);
  }
};
