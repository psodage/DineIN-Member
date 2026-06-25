# DineIN Member

Production monorepo for the DineIN member mobile app and API.

## Structure

```
DINEIN-MEMBER/
├── frontend/     # React Native (Expo) member app
├── web/          # React PWA (Vite + Tailwind) — installable web app
├── backend/      # Node.js / Express API
├── README.md
└── .gitignore
```

## Prerequisites

- Node.js 18+
- npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/) and [EAS CLI](https://docs.expo.dev/build/setup/) for mobile builds
- MongoDB connection string for the backend (see `backend/.env.example`)

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

Point `EXPO_PUBLIC_API_BASE_URL` at your backend (no trailing slash). EAS build profiles in `frontend/eas.json` set this for preview/production.

## Web PWA (Vite)

Installable member app for browsers (desktop, tablet, mobile):

```bash
cd web
cp .env.example .env   # set VITE_API_BASE_URL
npm install
npm run dev            # http://localhost:5173
npm run build          # output: web/dist
```

Deploy to Vercel with root directory `web`. See [web/README.md](web/README.md) for PWA install steps and full route map.

## Backend (Express)

```bash
cd backend
cp .env.example .env   # first time only
npm install
npm start
```

Development with auto-reload:

```bash
npm run dev
```

API listens on the port in `backend/.env` (default `5000`). Health check: `GET /health`.

## Development workflow

1. Start MongoDB and configure `backend/.env`.
2. Run the backend from `backend/`.
3. Run the Expo app from `frontend/` and scan the QR code or use an emulator.
4. For a physical device on the same LAN, set `EXPO_PUBLIC_API_BASE_URL` to `http://<your-pc-lan-ip>:5000` in `frontend/.env`.

## License

Private — all rights reserved.
