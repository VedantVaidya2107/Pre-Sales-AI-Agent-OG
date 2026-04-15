# Fristine AI Pre-Sales Agent 🚀

The **Fristine AI Pre-Sales Agent** is an intelligent presales consultation system designed to automate discovery, solution recommendation, and proposal generation for Fristine Infotech — India's leading Premium Zoho Partner.

Built using **FastAPI**, **Vite**, and **Google Gemini**, this platform conducts natural, customer-focused conversations to understand business needs and recommend tailored solutions.

---

## 🌟 Key Features

### 💬 Conversational Presales Consultant
- **Customer-First Approach**: Greets warmly, listens actively, and recommends specific solutions — no product dumps or jargon.
- **3-Step Discovery Flow**: Greet & Ask → Listen & Clarify → Recommend Solution.
- **Smart Questioning**: Asks maximum 2 focused questions at a time to understand pain points, current systems, and desired outcomes.
- **Solution-Focused**: Provides specific, named recommendations with clear benefits and implementation timelines.

### 📞 Calling Agent (Voice & Chat)
- **Natural Voice Conversations**: Pipecat-powered voice bot with Deepgram STT, Cartesia/Deepgram TTS, and Google Gemini LLM.
- **Conversational Persona**: Warm, helpful, and concise — asks "How can I help?" instead of launching into product pitches.
- **Barge-In Support**: Customers can interrupt the agent naturally during voice calls.
- **Document Analysis**: Extract requirements directly from uploaded BRDs, SOWs, or RFPs (.docx, .pdf, .txt).

### 📋 Staff Dashboard (Agent Portal)
- **Client Pipeline**: End-to-end tracking from "Bot Sent" to "Proposal Submitted."
- **KPI Cards**: Real-time metrics with clickable filtering (Total, Sent, Active, Proposals).
- **Mobile Responsive**: Fully optimized for mobile devices with touch-friendly drawer menu.
- **Outbound Calling**: One-click Twilio/LiveKit outbound calls to clients directly from the dashboard.

### 📄 Strategic Document Generation
- **Boardroom-Ready Proposals**: Professional, technical plans with high-fidelity formatting.
- **BRD & FSD**: Auto-generated Business Requirements and Functional Specification Documents.
- **High-Fidelity Export**: One-click **PDF (3x High-Res)** and **DOCX (Editable Word)** generation.

### 🛡️ Demo Mode Resilience
- **Smart Mock Mode**: Automatic fallback when backend is unreachable — demos always work.
- **Connectivity Intelligence**: Real-time status monitoring with one-click "Retry & Reconnect."

---

## 🤖 AI Persona: Presales Consultant

The agent follows a structured yet natural conversation flow:

| Step | Behavior |
|------|----------|
| **Greet** | "Hello! How can I help you today?" |
| **Listen** | Asks 1-2 focused questions about their situation |
| **Clarify** | Understands pain points, current systems, and goals |
| **Recommend** | Names a specific solution with 3-4 key benefits |
| **Next Steps** | Offers a demo or connects with the sales team |

**Key rules:**
- Never discusses pricing (redirects to sales team)
- Never dumps product lists — recommends one specific solution
- Uses MEDDPICC internally for lead qualification (invisible to customer)
- Keeps voice responses short and conversational

---

## 🏗️ Architecture

```text
Pre-Sales-Agent/
├── backend/               # FastAPI + Supabase Backend
│   ├── main.py            # App entry point & Routing
│   ├── routers/           # API domains (Auth, Proposals, Tracking, Gemini, Voice)
│   ├── src/               # AI services (pipecat_bot.py, gemini.js)
│   └── utils/             # Supabase client & utility functions
├── frontend/              # Vite Frontend
│   ├── index.html         # Unified UI (Login, Dashboard, Bot Discovery)
│   ├── src/               # Application logic & AI orchestration (main.js)
│   └── services/          # API layer (api.js)
└── .github/workflows/     # CI/CD for GitHub Pages
```

---

## 🛠️ Tech Stack

- **Large Language Models**: Google Gemini 2.0 Flash (Discovery) & Gemini Pro (Architecture & Proposals).
- **Voice Pipeline**: Pipecat, Deepgram (STT), Cartesia (TTS), Twilio (Telephony).
- **Backend**: Python 3.10+, FastAPI, Uvicorn, Supabase (PostgreSQL).
- **Frontend**: Vanilla JavaScript, Vite, GSAP (Animations), html2pdf.js, Mammoth.
- **Infrastructure**: Render (API Service), GitHub Pages (UI Hosting), Localtunnel (Dev).

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ & Python 3.10+
- Google Gemini API Key
- Supabase Project URL & **Service Role Key**
- Deepgram API Key (for voice features)
- Twilio Account (for outbound calling)

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
# Activate venv: .venv\Scripts\activate (Win) or source .venv/bin/activate (Mac/Linux)
pip install -r requirements.txt
cp .env.example .env # Set your API keys
python main.py
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Quick Start (Windows)
```powershell
.\start-app.ps1  # Starts backend, frontend, voice agent, and tunnel
```

---

## 🌐 Live Deployment

- **Frontend (GitHub Pages)**: [https://vedantvaidya2107.github.io/Pre-Sales-AI-Agent-OG/](https://vedantvaidya2107.github.io/Pre-Sales-AI-Agent-OG/)
- **Backend (Render)**: `https://presales-backend-5u8q.onrender.com`

---

## 🛡️ Security & Privacy
- **Hardened Environment**: Sanitized configuration patterns prevent accidental secret exposure.
- **Client-Restricted Access**: Raw proposals hidden from the discovery bot interface.
- **Secure Sessions**: Client IDs and authenticated Agent sessions ensure data isolation.
- **RBAC**: Backend operations protected by Supabase RLS.

---

## 💎 About Fristine Infotech
With over 500+ successful Zoho implementations across sectors like Manufacturing, Finance, and Retail, Fristine Infotech is a trusted strategic partner for digital transformation. This AI agent represents our commitment to "Speed, Precision, and Proof."

© 2026 Fristine Infotech Pvt Ltd. All rights reserved.
