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
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use('/api', reportRoutes);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/webhooks', webhookRoutes);
app.use(cors({
  origin: ['https://xlip.uk', 'http://100.77.215.54:8888'],
  credentials: true
}));
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
