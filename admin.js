import express from 'express';
const router = express.Router();
import { pool } from './index.js'; // Note the .js extension is required in ESM

const adminGuard = async (req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!clientIp.includes('100.')) {
        return res.status(403).json({ error: "Access Denied: Non-Tailnet connection" });
    }

    try {
        const user = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        if (!user.rows[0]?.is_admin) {
            return res.status(403).json({ error: "Access Denied: Not an admin" });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: "Internal Auth Error" });
    }
};

// GET: Full System Overview
router.get('/stats', adminGuard, async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM links) as total_links,
                (SELECT COUNT(*) FROM analytics) as total_clicks
        `);
        const links = await pool.query(`
            SELECT l.*, u.email as owner_email, COUNT(a.id) as clicks
            FROM links l 
            JOIN users u ON l.user_id = u.id 
            LEFT JOIN analytics a ON l.id = a.link_id
            GROUP BY l.id, u.email 
            ORDER BY l.created_at DESC
        `);
        res.json({ stats: stats.rows[0], links: links.rows });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// DELETE: Admin Nuke (Force delete any link)
router.delete('/nuke/:id', adminGuard, async (req, res) => {
    try {
        // Adding ::int prevents the 'could not determine data type' error
        await pool.query('DELETE FROM links WHERE id = $1::int', [req.params.id]);
        res.json({ message: "Link nuked successfully" });
    } catch (err) {
        console.error("NUKE ERROR:", err);
        res.status(500).json({ error: "Failed to nuke link" });
    }
});

export default router;
