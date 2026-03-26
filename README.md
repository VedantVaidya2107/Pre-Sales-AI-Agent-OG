# Fristine Presales Portal

An AI-powered presales management platform for Fristine Infotech — India's leading Premium Zoho Partner. The system automates client discovery sessions, generates Zoho implementation proposals, and produces FSD/BRD documents.

## Architecture

```
presales-fixed/
├── backend/               # Python FastAPI backend
│   ├── main.py            # App entry point, CORS config, router registration
│   ├── routers/
│   │   ├── auth.py        # Agent authentication (email/password)
│   │   ├── clients.py     # Client CRUD operations
│   │   ├── proposals.py   # Proposal versioning & storage
│   │   ├── tracking.py    # Client pipeline event tracking
│   │   ├── email.py       # Email sending (Gmail SMTP or simulated)
│   │   └── gemini.py      # Google Gemini AI proxy
│   ├── utils/store.py     # JSON file-based data store
│   ├── data/              # JSON data files (agents, clients, events, proposals)
│   └── requirements.txt   # Python dependencies
├── frontend/              # Vanilla JS + Vite frontend
│   ├── index.html         # All UI screens (login, dashboard, tracking, bot)
│   ├── style.css          # Full CSS with dark mode + responsive
│   ├── src/
│   │   ├── main.js        # Application logic, AI discovery, proposal generation
│   │   └── services/api.js # API client for all backend endpoints
│   ├── vite.config.js     # Vite dev server + API proxy config
│   └── package.json
├── integrations/          # Google Apps Script integration
├── scripts/               # Quick start & test scripts
├── docs/                  # BRD PDFs and documentation
└── .github/workflows/     # GitHub Pages deployment
```

## Features

- **Agent Portal** — Staff login, client pipeline dashboard, lead management
- **AI Discovery Bot** — Gemini-powered client-facing chatbot that conducts MEDDPICC discovery sessions
- **Proposal Generation** — Auto-generates professional Zoho implementation proposals as PDF
- **BRD Generation** — Generates Business Requirements Documents from discovery data
- **FSD Generation** — Generates Functional Specification Documents with module configurations
- **Pipeline Tracking** — Bot Sent → Accessed → In Session → Proposal → Submitted
- **Email Integration** — Send bot session links to clients via Gmail SMTP
- **File Upload** — Clients can upload .docx/.pdf files for requirements extraction
- **Voice Input** — Speech-to-text for the discovery chat
- **Dark Mode** — Full light/dark theme support
- **Conversation Memory** — Sessions persist in localStorage (7-day expiry)

## Prerequisites

- **Python 3.10+** — Backend runtime
- **Node.js 18+** — Frontend build tooling
- **Gemini API Key** — Required for AI features ([Get one here](https://ai.google.dev/))

## Local Setup

### 1. Clone and configure

```bash
git clone <repo-url>
cd presales-fixed
```

### 2. Backend setup

```bash
cd backend

# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate    # macOS/Linux
# .venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

Edit `backend/.env` and set your values:

```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Optional (defaults shown)
PORT=3001
FRONTEND_URL=http://localhost:5173

# Optional — leave blank for simulated email
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
```

Start the backend:

```bash
python main.py
```

The API will be available at `http://localhost:3001`. Verify with:

```bash
curl http://localhost:3001/health
```

### 3. Frontend setup

Open a **new terminal**:

```bash
cd frontend

# Install dependencies
npm install

# Create environment file (optional — defaults work for local dev)
cp .env.example .env

# Start dev server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### 4. Quick start (alternative)

```bash
chmod +x scripts/quick-start.sh
./scripts/quick-start.sh
```

This automates steps 2-3 above.

## Usage

### Staff Portal

1. Open `http://localhost:5173`
2. Login with any `@fristinetech.com` email
3. First login will prompt you to set a password (min 8 characters)
4. From the dashboard you can:
   - **Add Lead** — Create a new client entry
   - **Send Bot** — Email the AI discovery link to a client
   - **Track** — View pipeline status, event log, and proposals
   - **Copy Link** — Copy the bot session URL to share manually

### Client Discovery Bot

1. Clients access their session via `http://localhost:5173/?client=FRIST001`
2. The AI conducts a 5-6 round MEDDPICC discovery session
3. After gathering requirements, a summary is shown for confirmation
4. On confirmation, three documents can be generated:
   - **Proposal** — Full Zoho implementation proposal (PDF)
   - **BRD** — Business Requirements Document (PDF)
   - **FSD** — Functional Specification Document (PDF)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/auth/check?email=` | Check if agent has a password set |
| `POST` | `/api/auth/login` | Agent login |
| `POST` | `/api/auth/set-password` | Set/reset agent password |
| `GET` | `/api/clients` | List all clients |
| `GET` | `/api/clients/next-id` | Get next auto-generated client ID |
| `GET` | `/api/clients/{id}` | Get single client |
| `POST` | `/api/clients` | Create client (returns 201) |
| `PUT` | `/api/clients/{id}` | Update client |
| `DELETE` | `/api/clients/{id}` | Delete client |
| `GET` | `/api/tracking/{client_id}` | Get tracking events |
| `POST` | `/api/tracking/{client_id}` | Log tracking event |
| `DELETE` | `/api/tracking/{client_id}` | Delete tracking events |
| `GET` | `/api/proposals/{client_id}` | Get proposal (with versions) |
| `POST` | `/api/proposals/{client_id}` | Create proposal version |
| `PUT` | `/api/proposals/{client_id}` | Update proposal version |
| `POST` | `/api/email/send-bot` | Send bot link email |
| `POST` | `/api/gemini/generate` | Proxy to Gemini AI |

## Production Deployment

### Backend Deployment (Render)

This repository includes a `render.yaml` file for automated deployment to [Render](https://render.com/).

**Automated Deployment (Recommended):**
1. Click **New +** on Render and select **Blueprint**.
2. Connect this repository. Render will automatically provision the Python web service on the Free tier.
3. Add your environment variables in the Render dashboard.

**Manual Deployment (Web Service):**
If creating a "Web Service" manually on Render (or another cloud host), configure the following:
- **Language**: `Python 3`
- **Root Directory**: `(leave blank)`
- **Build Command**: `cd backend && pip install -r requirements.txt`
- **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`

Set environment variables:

```env
PORT=10000
ENV=production
GEMINI_API_KEY=your_key
FRONTEND_URL=https://your-frontend-domain.com
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM=noreply@fristinetech.com
```

For process management, use `gunicorn`:

```bash
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:3001
```

### Frontend (Vercel)

The project includes `vercel.json` for Vercel deployment:

```bash
cd frontend
```

Set environment variables in Vercel dashboard:

```
VITE_API_URL=https://your-backend-domain.com
VITE_DEPLOY_URL=https://your-frontend-domain.com
```

Deploy:

```bash
npx vercel --prod
```

### Frontend (GitHub Pages)

Set the base path for GitHub Pages:

```bash
cd frontend
VITE_BASE_PATH=/Pre-Sales-AI-Agent/ npm run build
```

The GitHub Actions workflow in `.github/workflows/deploy.yml` handles this automatically on push to `main`.

### Frontend (Nginx / static hosting)

```bash
cd frontend
npm run build
# Serve the `dist/` directory
```

Nginx config example:

```nginx
server {
    listen 80;
    server_name presales.fristinetech.com;
    root /var/www/presales/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Data Storage

The backend uses a flat-file JSON store in `backend/data/`:

- `agents.json` — Agent accounts and passwords
- `clients.json` — Client records
- `events.json` — Pipeline tracking events
- `proposals.json` — Proposal HTML versions

For production, consider migrating to a proper database (PostgreSQL, MongoDB) for concurrent access safety.

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key |
| `PORT` | No | `3001` | Server port |
| `ENV` | No | `development` | Set to `production` for restricted CORS |
| `FRONTEND_URL` | No | `http://localhost:5173` | Allowed CORS origin |
| `EMAIL_USER` | No | — | Gmail address for sending emails |
| `EMAIL_PASS` | No | — | Gmail App Password |
| `EMAIL_FROM` | No | `EMAIL_USER` | Sender address |

### Frontend (`frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `http://localhost:3001` | Backend API URL |
| `VITE_DEPLOY_URL` | No | `window.location.origin` | Public URL (for bot email links) |
| `VITE_BASE_PATH` | No | `/` | Vite base path (set for GitHub Pages) |

## Known Limitations

- **Authentication** — Passwords are stored in plaintext. For production, add bcrypt hashing and JWT tokens.
- **Data store** — JSON files are not safe for concurrent writes. Use a database in production.
- **File uploads** — Image/PDF content extraction is limited; .docx and text files work best.
- **Email** — Only Gmail SMTP is supported. Falls back to simulated mode without credentials.

## Tech Stack

- **Backend**: Python 3, FastAPI, Uvicorn, Google GenAI SDK
- **Frontend**: Vanilla JavaScript, Vite, html2pdf.js, Mammoth.js
- **AI**: Google Gemini 2.5 (Flash for chat, Pro for JSON/proposals)
- **Deployment**: Vercel (frontend), any Python host (backend)
