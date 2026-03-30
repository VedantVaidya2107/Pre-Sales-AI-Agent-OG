# Fristine AI Pre-Sales Architect (OG) 🚀

The **Fristine AI Pre-Sales Architect** is a state-of-the-art multi-agent system designed to automate the initial discovery, solution architecting, and proposal generation phases for Fristine Infotech — India's leading Premium Zoho Partner.

Built using **FastAPI**, **React (Vite)**, and **Google Gemini 1.5**, this platform transforms the presales workflow by conducting high-fidelity technical consultations and generating boardroom-ready implementation plans in minutes.

---

## 🌟 Key Features

### 🤖 High-Fidelity AI Discovery
- **MEDDPICC Grounding**: Conducts structured discovery focused on Metrics, Economic Buyers, and Pain Points.
- **Organizational Awareness**: Implicitly researches the client's industry and scale before starting, providing a "homework-first" consultation experience.
- **Document Analysis**: Extract requirements directly from uploaded BRDs, SOWs, or RFPs (.docx, .pdf, .txt).

### 📞 Calling Agent (Voice & Chat)
- **Autonomous Interaction**: A specialized "AI Pre-Sales Architect" persona that provides concise, direct, and time-aware consultation.
- **Direct Replying**: Trained for extreme conciseness (<60 words) to respect the client's time.
- **Active Listening**: Acknowledges specific technical details shared by the user before moving to the next strategic question.

### 📋 Staff Dashboard (Agent Portal)
- **Client Pipeline**: End-to-end tracking from "Bot Sent" to "Proposal Submitted."
- **Mobile Responsive**: Fully optimized for mobile devices with a touch-friendly drawer menu and responsive tables.
- **Secure Handoff**: Professional "Agent-Only" control over when proposals are shared with the client.

### 📄 Strategic Document Generation
- **Implementation Proposals**: Professional, 13-page technical plans tailored to the client's specific modules.
- **BRD & FSD**: Auto-generated Business Requirements and Functional Specification Documents.
- **One-Click Export**: High-quality PDF and DOCX generation for immediate stakeholder review.

---

## 🏗️ Architecture

```text
Pre-Sales-AI-Agent-OG/
├── backend/               # FastAPI + Supabase Backend
│   ├── main.py            # App entry point & Routing
│   ├── routers/           # Specialized API domains (Auth, Proposals, Tracking, Gemini)
│   └── utils/             # Supabase client & utility functions
├── frontend/              # React / Vite Frontend
│   ├── index.html         # Unified UI (Login, Dashboard, Bot Discovery)
│   ├── src/               # Application logic & AI orchestration (main.js)
│   └── services/          # API layer (api.js)
└── .github/workflows/     # CI/CD for GitHub Pages
```

---

## 🛠️ Tech Stack

- **Large Language Models**: Google Gemini 1.5 Flash (Discovery) & Gemini 1.5 Pro (Architecture & Proposals).
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Supabase (PostgreSQL).
- **Frontend**: Vanilla JavaScript (React patterns), Vite, GSAP (Animations), html2pdf.js, Mammoth.
- **Infrastructure**: Render (API Service), GitHub Pages (UI Hosting).

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ & Python 3.10+
- Google Gemini API Key
- Supabase Project URL & **Service Role Key** (Required for agent creation)

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Activate venv: .venv\Scripts\activate (Win) or source .venv/bin/activate (Mac/Linux)
pip install -r requirements.txt
cp .env.example .env # Set your SUPABASE_URL, SUPABASE_KEY (Service Role), and GEMINI_API_KEY
python main.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
# Create .env or .env.production with VITE_API_URL=https://your-backend.onrender.com
npm run dev
```

---

## 🌐 Live Deployment

- **Frontend (GitHub Pages)**: [https://vedantvaidya2107.github.io/Pre-Sales-AI-Agent-OG/](https://vedantvaidya2107.github.io/Pre-Sales-AI-Agent-OG/)
- **Backend (Render)**: `https://presales-backend-5u8q.onrender.com`

---

## 🛡️ Security & Privacy
- **Client-Restricted Access**: Raw proposals are hidden from the discovery bot interface.
- **Secure Sessions**: Uses Client IDs and authenticated Agent sessions to ensure data isolation.
- **RBAC**: Backend operations are protected by Supabase RLS (ensure Service Role key is used in production).

---

## 💎 About Fristine Infotech
With over 500+ successful Zoho implementations across sectors like Manufacturing, Finance, and Retail, Fristine Infotech is a trusted strategic partner for digital transformation. This AI agent represents our commitment to "Speed, Precision, and Proof."

© 2026 Fristine Infotech Pvt Ltd. All rights reserved.
