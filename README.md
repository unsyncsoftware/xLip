# xLip

A link shortener SaaS with custom subdomains, bio profiles, click analytics, and PayPal payments. Self-hosted and production-ready.

**Live at [xlip.uk](https://xlip.uk)**

---

## Features

- **Link Shortening** — Short URLs with optional custom slugs
- **Custom Subdomains** — Each user gets their own `username.xlip.uk`
- **Bio Profiles** — Public profile pages with link collections
- **Click Analytics** — Per-link click tracking with visitor data
- **PPP Geo-IP Pricing** — Purchasing power parity pricing by country
- **PayPal Payments** — Subscription upgrades via PayPal webhooks
- **Trial System** — Free trial with automated expiry emails
- **Race Control** — Internal admin dashboard for monitoring
- **Rate Limiting** — Per-IP and per-user request throttling
- **JWT Auth** — Stateless authentication with refresh tokens

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| Database | PostgreSQL |
| Auth | JWT |
| Email | Resend |
| Payments | PayPal |
| Process Manager | PM2 |
| Tunnel | Cloudflare Tunnel |
| Frontend | Vanilla HTML/CSS/JS |

---

## Project Structure

```
xlip.uk/
├── routes/
│   ├── auth.js          # Login, register, JWT
│   ├── links.js         # Link CRUD
│   ├── bio.js           # Bio profile endpoints
│   ├── subdomains.js    # Subdomain routing
│   ├── webhooks.js      # PayPal webhook handler
│   └── redirect.js      # Short URL redirect logic
├── middleware/
│   ├── checkLimit.js    # Plan-based limits
│   ├── jwt.js           # Auth middleware
│   ├── logger.js        # Request logging
│   ├── rateLimit.js     # Rate limiting
│   └── upload.js        # File upload handler
├── jobs/
│   └── trialExpiry.js   # Trial expiry email job
├── cron/
│   └── trialCron.js     # Cron scheduler
├── public/              # Static frontend files
├── db.js                # PostgreSQL connection
├── index.js             # Main app entry point
└── admin-server.js      # Admin dashboard server
```

---

## Self-Hosting

### Prerequisites

- Node.js 18+
- PostgreSQL
- PM2 (`npm install -g pm2`)
- Cloudflare account (for tunnel)
- PayPal developer account
- Resend account (for emails)

### Setup

**1. Clone the repo**
```bash
git clone https://github.com/chukoizkie/xLip.git
cd xLip
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/xlip
JWT_SECRET=your-secret-key
RESEND_API_KEY=re_xxxxxxxxxxxx
PAYPAL_CLIENT_ID=your-paypal-client-id
PAYPAL_CLIENT_SECRET=your-paypal-secret
PAYPAL_WEBHOOK_ID=your-webhook-id
BASE_URL=https://xlip.uk
ADMIN_SECRET=your-admin-password
```

**3. Run database migrations**
```bash
node db.js
```

**4. Start with PM2**
```bash
pm2 start index.js --name xlip-app
pm2 start admin-server.js --name xlip-admin
pm2 save
pm2 startup
```

**5. Set up Cloudflare Tunnel**
```bash
cloudflared tunnel create xlip
cloudflared tunnel route dns xlip xlip.uk
cloudflared tunnel run xlip
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/auth/refresh` | Refresh access token |

### Links
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/links` | List user's links |
| POST | `/api/links` | Create short link |
| PUT | `/api/links/:id` | Update link |
| DELETE | `/api/links/:id` | Delete link |
| GET | `/api/links/:id/stats` | Click analytics |

### Bio
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/bio` | Get bio profile |
| PUT | `/api/bio` | Update bio profile |

### Webhooks
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/webhooks/paypal` | PayPal payment events |

---

## Deployment

This repo uses a self-hosted GitHub Actions runner on the production server. Pushing to `main` automatically deploys:

```
git push origin main
→ git pull on server
→ npm install --production
→ pm2 reload xlip-app && pm2 reload xlip-admin
```

---

## License

MIT
