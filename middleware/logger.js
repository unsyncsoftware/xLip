import { pool } from '../db.js';

export const logVisit = (action, detail = '') => (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  pool.query(
    'INSERT INTO visitor_logs (ip_address, action, detail) VALUES ($1, $2, $3)',
    [ip, action, detail || req.originalUrl]
  ).catch(() => {});
  next();
};
