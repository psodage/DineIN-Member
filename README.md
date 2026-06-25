# DineIN Member

Production monorepo for the DineIN member mobile app and API.

## Structure

```
DINEIN-MEMBER/
├── frontend/        # React Native (Expo) member app
├── web/             # React PWA (Vite + Tailwind) — installable web app
├── backend/         # Node.js / Express API (see below for full tree)
├── README.md
└── .gitignore
```

### Backend folder tree

```
backend/
├── config/
│   └── db.js                  # Mongoose connection + reconnection + migrations
├── controllers/               # Route handler logic (thin layer over services)
├── jobs/
│   └── monthlyBillEmailJob.js # Scheduled email job
├── middleware/
│   ├── authMiddleware.js      # JWT verification
│   └── rateLimiter.js        # (per-route overrides if needed)
├── models/                    # Mongoose schemas
├── routes/
│   ├── healthRoutes.js        # GET /health — zero DB I/O keep-alive endpoint
│   ├── authRoutes.js
│   └── …                     # All other API routes
├── scripts/                   # One-off maintenance scripts
├── utils/
│   └── logger.js              # Lightweight timestamped console logger
├── .env                       # Local secrets — never commit
├── .env.example               # Template committed to git
├── package.json
└── server.js                  # Application entry point
```

---

## Prerequisites

- Node.js 18+
- npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/) and [EAS CLI](https://docs.expo.dev/build/setup/) for mobile builds
- MongoDB Atlas connection string (see `backend/.env.example`)

---

## Frontend (Expo)

```bash
cd frontend
cp .env.example .env   # first time only — set EXPO_PUBLIC_API_BASE_URL
npm install
npx expo start
```

### EAS Build & OTA (run from `frontend/`)

```bash
cd frontend
eas build --platform android --profile production
eas update --channel production --message "OTA update"
```

Point `EXPO_PUBLIC_API_BASE_URL` at your backend (no trailing slash).

---

## Web PWA (Vite)

```bash
cd web
cp .env.example .env   # set VITE_API_BASE_URL
npm install
npm run dev            # http://localhost:5173
npm run build          # output: web/dist
```

Deploy to Vercel with root directory `web`.

---

## Backend (Express)

### Local development

```bash
cd backend
cp .env.example .env   # fill in MONGODB_URI and JWT_SECRET
npm install
npm run dev            # nodemon — auto-restarts on file changes
```

The API listens on `http://localhost:5000` by default (or `PORT` in `.env`).

Verify it is running:

```bash
curl http://localhost:5000/health
# → {"status":"ok","timestamp":"…","uptime":5,"db":"connected"}
```

### Production start

```bash
npm start   # node server.js
```

---

## Deploying to Render (free tier)

> **Tip — avoid cold starts:** Render's free tier spins down instances after
> 15 minutes of inactivity. The `/health` endpoint + UptimeRobot section below
> explains how to keep your dyno warm 24 / 7 at zero cost.

### Step-by-step

1. **Push your code** to a GitHub repository (if not already).

2. **Create a new Web Service** on [render.com](https://render.com):
   - Connect your GitHub repo
   - **Root directory:** `backend`
   - **Runtime:** `Node`
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** `Free`

3. **Add environment variables** in the Render dashboard  
   *(Settings → Environment → Add Environment Variable)*:

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | your Atlas connection string |
   | `JWT_SECRET` | long random string |
   | `CORS_ORIGIN` | `*` or your client origins |
   | `GMAIL_USER` | Gmail address (optional) |
   | `GMAIL_APP_PASSWORD` | Google App Password (optional) |

   > **Security:** Never put secrets in `.env.example` or commit your `.env` file.
   > Always set them via the Render dashboard or a secrets manager.

4. **Deploy** — Render will build and start the service automatically.

5. **Verify the deployment** by visiting:
   ```
   https://dinein-member.onrender.com/health
   ```
   Expected response:
   ```json
   {
     "status": "ok",
     "timestamp": "2025-06-25T17:00:00.000Z",
     "uptime": 42,
     "db": "connected"
   }
   ```

---

## Keep-Alive: UptimeRobot configuration

Render free-tier instances sleep after **15 minutes of inactivity**.  
UptimeRobot pings `/health` every 5 minutes to prevent this — completely free.

### Why `/health` and not another endpoint?

- Zero database I/O → responds in < 5 ms even when MongoDB is reconnecting.
- Not rate-limited (mounted before `express-rate-limit`).
- Never returns non-200 (so UptimeRobot never marks the site as "down").

### Setup (takes ~2 minutes)

1. Sign up at [uptimerobot.com](https://uptimerobot.com) — free plan supports
   50 monitors with 5-minute intervals.

2. Click **"+ Add New Monitor"**.

3. Fill in the form:

   | Field | Value |
   |---|---|
   | **Monitor Type** | `HTTP(s)` |
   | **Friendly Name** | `DineIN Member API` |
   | **URL** | `https://dinein-member.onrender.com/health` |
   | **Monitoring Interval** | `5 minutes` |
   | **Monitor Timeout** | `30 seconds` |

4. Under **"Alert Contacts"**, add your email so you get notified if the
   service goes down (optional but recommended).

5. Click **"Create Monitor"**.

UptimeRobot will now ping the endpoint every 5 minutes, keeping Render's
free-tier dyno warm at all times.

### Verify the monitor is working

After a few minutes, UptimeRobot's dashboard should show a green **"Up"**
status.  You can also check Render's logs to see the periodic requests being
skipped by morgan's `skip` filter (they won't appear in your logs by design).

---

## Development workflow

1. Start MongoDB locally or point `.env` at Atlas.
2. Run the backend:
   ```bash
   cd backend && npm run dev
   ```
3. Run the Expo app:
   ```bash
   cd frontend && npx expo start
   ```
4. For a physical device on the same LAN, set `EXPO_PUBLIC_API_BASE_URL` to
   `http://<your-pc-lan-ip>:5000` in `frontend/.env`.

---

## Security notes

- **JWT_SECRET** — generate with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
  ```
- **MongoDB** — use Atlas IP allowlist to restrict connections to your Render
  service's static IP (available on paid Render plans) or allow only Atlas
  Data API calls.
- **CORS_ORIGIN** — for production web clients, replace `*` with explicit
  origin(s) to prevent cross-site request abuse.
- **Helmet** — HTTP security headers are applied automatically. Review
  `helmet()` options if you need to customise CSP for your frontend.

---

## License

Private — all rights reserved.
