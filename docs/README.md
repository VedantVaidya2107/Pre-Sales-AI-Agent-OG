# Fristine Infotech — Presales AI Agent v2

A full-stack AI-powered presales platform with a **Node.js/Express backend** and a **redesigned, smooth Vite frontend**.

---

## Project Structure

```
presales-agent/
├── backend/                  # Express.js REST API
│   ├── server.js             # Entry point
│   ├── routes/
│   │   ├── auth.js           # Agent login & password management
│   │   ├── clients.js        # Client CRUD (replaces Google Sheets)
│   │   ├── tracking.js       # Event tracking (replaces Apps Script)
│   │   ├── proposals.js      # Proposal storage
│   │   ├── email.js          # Send bot emails via Gmail SMTP
│   │   └── gemini.js         # Gemini AI proxy (key stays server-side)
│   ├── middleware/
│   │   └── store.js          # JSON file persistence
│   └── data/                 # Auto-created JSON data files
│       ├── agents.json       # Agent credentials
│       ├── clients.json      # Client records
│       ├── events.json       # Tracking events
│       └── proposals.json    # Generated proposals
│
└── frontend/                 # Vite + Vanilla JS
    ├── index.html            # Redesigned HTML structure
    ├── vite.config.js        # Dev proxy → backend
    └── src/
        ├── main.js           # All app logic (uses backend API)
        ├── style.css         # Redesigned CSS (Syne + Inter fonts)
        └── services/
            └── api.js        # All API calls in one place
```

---

## Quick Start

### 1. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: add your GEMINI_API_KEY, EMAIL_USER, EMAIL_PASS
npm run dev        # http://localhost:3001
```

### 2. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Edit .env if needed (defaults work for local dev)
npm run dev        # http://localhost:5173
```

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3001) |
| `GEMINI_API_KEY` | Your Google Gemini API key |
| `EMAIL_USER` | Gmail address for sending bot emails |
| `EMAIL_PASS` | Gmail App Password (not your account password) |
| `EMAIL_FROM` | Display name + email for sender |
| `FRONTEND_URL` | Frontend URL for CORS (default: http://localhost:5173) |

### Frontend (`frontend/.env`)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (default: http://localhost:3001) |
| `VITE_DEPLOY_URL` | Deployed frontend URL (used in bot email links) |

---

## What Changed from v1

| Feature | Before (v1) | After (v2) |
|---|---|---|
| **Backend** | Google Apps Script (no backend) | Node.js + Express REST API |
| **Data storage** | Google Sheets (CSV export) | JSON files via backend |
| **AI proxy** | Gemini key exposed in frontend | Key hidden in backend `.env` |
| **Email** | Apps Script Gmail | Nodemailer via Gmail SMTP |
| **Auth** | localStorage only | Backend `/api/auth` routes |
| **Proposals** | localStorage only | Backend `/api/proposals` |
| **Tracking** | Apps Script + localStorage | Backend `/api/tracking` |
| **Fonts** | Plus Jakarta Sans | Syne (display) + Inter (body) |
| **UI** | Original design | Completely redesigned — smoother, modern |
| **Password field** | No toggle | Eye icon to show/hide |
| **Search** | None | Live client search in dashboard |
| **Toast messages** | Browser alerts | Smooth toast notifications |

---

## Gmail App Password Setup

1. Go to your Google Account → Security → 2-Step Verification (enable if not on)
2. Go to Security → App passwords
3. Create a new app password for "Mail"
4. Use that 16-character password as `EMAIL_PASS`

---

## Production Deployment

### Backend (e.g. Railway, Render, DigitalOcean)
```bash
cd backend
npm start
```
Set all environment variables in your hosting platform's dashboard.

### Frontend (e.g. Vercel, Netlify, GitHub Pages)
```bash
cd frontend
npm run build
# Deploy the dist/ folder
```
Set `VITE_API_URL` to your deployed backend URL before building.
