import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { authenticateToken } from './middleware/jwt.js';
import { logVisit } from './middleware/logger.js';
import authRoutes from './routes/auth.js';
import linkRoutes from './routes/links.js';
import bioRoutes from './routes/bio.js';
import subdomainRoutes from './routes/subdomains.js';
import redirectRoute from './routes/redirect.js';
import apiRoutes from './routes/api.js';
import webhookRoutes from './routes/webhooks.js';
import contactRoutes from './routes/contact.js';
import { runTrialExpiryJob } from './jobs/trialExpiry.js';
import reportRoutes from './routes/report.js';
import { isAllowedHost } from './lib/security.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/webhooks', webhookRoutes);
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'https://xlip.uk',
      'https://www.xlip.uk',
      'http://100.77.215.54:8888',
      ...(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean)
    ];
    const allowedExtensions = (process.env.ALLOWED_EXTENSION_ORIGINS || '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);
    if (!origin || allowed.includes(origin) || allowedExtensions.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use('/api', reportRoutes);
app.set('trust proxy', 1);
// ── LOG HOMEPAGE VISITS ──
app.get('/', logVisit('page_view', 'homepage'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// ── BIO EDIT PAGE ──
app.get('/bio/edit', authenticateToken, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bio-edit.html'));
});
app.get('/connect', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'connect.html'));
});
// ── API ROUTES ──
app.use('/api/auth', authRoutes);
app.use((req, res, next) => {
  if (!isAllowedHost(req.get('host'))) return res.status(400).json({ error: 'Invalid host' });
  next();
});
app.use('/api', linkRoutes);
app.use('/api', contactRoutes);
app.use('/api/bio', bioRoutes);
app.use('/api/subdomain', subdomainRoutes);
app.use('/api/v1', apiRoutes);
// ── REDIRECT (must be last) ──
app.use(redirectRoute);
// Run trial expiry check on startup
runTrialExpiryJob();
app.listen(process.env.PORT || 3000, () => {
  console.log(`xlip.uk running on ${process.env.PORT || 3000}`);
});
