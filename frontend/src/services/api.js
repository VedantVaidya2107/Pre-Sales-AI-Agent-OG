/* api.js — All backend API calls in one place */

const isNgrok = window.location.hostname.includes('ngrok-free.dev') || window.location.hostname.includes('ngrok.io');
const isCloudflare = window.location.hostname.includes('trycloudflare.com');
const isLocal = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 window.location.hostname.startsWith('192.168.');

const PROD_URL = 'https://presales-backend-5u8q.onrender.com';

// If on Ngrok, use the same host for API. If on Localhost, use :8000. Else use Prod.
let BASE = PROD_URL;
if (isLocal) {
  BASE = `http://${window.location.hostname}:8000`;
} else if (isNgrok || isCloudflare) {
  BASE = `${window.location.protocol}//${window.location.hostname}`;
} else if (import.meta.env.VITE_API_URL) {
  BASE = import.meta.env.VITE_API_URL;
}

BASE = BASE.replace(/\/$/, '');

console.log(`[API] Environment: ${isLocal ? 'LOCAL' : (isNgrok ? 'TUNNEL' : 'PROD')}`);
console.log(`[API] Base URL: ${BASE}`);

/* ══ MOCK MODE (runs when backend is unreachable) ══════════════════════════ */
const MOCK_AGENTS = {
  'test@fristinetech.com':  { email: 'test@fristinetech.com',  password: 'password123',    name: 'Test Agent' },
  'test2@fristinetech.com': { email: 'test2@fristinetech.com', password: 'testpassword123', name: 'Test Agent 2' },
};

const MOCK_CLIENTS = [
  { client_id: 'FRIST001', company: 'TATA', industry: 'Pharmaceuticals', email: 'vedantvaidya20@gmail.com', created_at: '2026-03-01T10:00:00Z' },
  { client_id: 'FRIST002', company: 'ACME Corp', industry: 'Manufacturing', email: 'vedantvaidya20@gmail.com', created_at: '2026-03-05T14:30:00Z' },
  { client_id: 'FRIST003', company: 'sdfghj', industry: 'asdfghjk', email: 'vedantvaidya20@gmail.com', created_at: '2026-03-10T09:15:00Z' },
  { client_id: 'FRIST004', company: 'RT', industry: 'gf', email: 'vedantvaidya20@gmail.com', created_at: '2026-03-15T11:00:00Z' },
  { client_id: 'FRIST005', company: 'dfg', industry: 'dfgh', email: 'dfgh', created_at: '2026-03-20T15:45:00Z' },
  { client_id: 'FRIST006', company: 'Test Lead', industry: 'Tech', email: 'vedantvaidya20@gmail.com', created_at: '2026-03-25T08:20:00Z' },
  { client_id: 'FRIST007', company: 'Acme Corp', industry: 'Manufacturing', email: 'client@company.com', created_at: '2026-03-29T13:10:00Z' },
  { client_id: 'TEST_LEAD_002', company: 'Test Company 2', industry: 'Technology', email: 'test2@example.com', created_at: '2026-03-30T10:05:00Z' },
];

const PRESET_MOCK_EVENTS = {
    'FRIST001': [{ event: 'bot_sent', timestamp: '2026-03-02T10:00:00Z' }],
    'FRIST002': [
        { event: 'bot_sent', timestamp: '2026-03-06T10:00:00Z' }, 
        { event: 'bot_accessed', timestamp: '2026-03-06T11:00:00Z' },
        { event: 'proposal_generated', timestamp: '2026-03-07T12:00:00Z' }
    ],
    'FRIST003': [{ event: 'bot_sent', timestamp: '2026-03-11T10:00:00Z' }],
    'FRIST004': [{ event: 'bot_sent', timestamp: '2026-03-15T10:00:00Z' }],
    'FRIST006': [{ event: 'bot_sent', timestamp: '2026-03-26T10:00:00Z' }],
    'FRIST007': [
        { event: 'bot_sent', timestamp: '2026-03-29T14:00:00Z' }, 
        { event: 'bot_accessed', timestamp: '2026-03-29T15:00:00Z' },
        { event: 'proposal_generated', timestamp: '2026-03-29T16:00:00Z' },
        { event: 'proposal_generated', timestamp: '2026-04-01T10:00:00Z' }
    ],
};

const GET_MOCK_HTML = (company, title, version = 1) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <title>Enterprise Proposal — ${company}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
    <style>
        :root { --p:#1A56DB; --navy:#0F172A; --slate:#475569; --bg:#F8FAFC; --w:#FFFFFF; --brd:#E2E8F0; --gray:#F1F5F9; }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Inter', sans-serif; color:var(--navy); line-height:1.6; background:#F1F5F9; }
        .page { max-width:960px; margin:20px auto; background:var(--w); box-shadow:0 30px 60px rgba(15,23,42,0.1); border-radius:16px; overflow:hidden; }
        .cover { height:800px; display:flex; flex-direction:column; justify-content:center; padding:80px; background: radial-gradient(circle at 100% 0%, rgba(26,86,219,0.05) 0%, transparent 40%), linear-gradient(135deg, #fff 0%, #f8fafc 100%); position:relative; }
        .cover::after { content:''; position:absolute; bottom:0; left:0; width:100%; height:10px; background:var(--p); }
        h1 { font-family:'DM Sans', sans-serif; font-size:48px; font-weight:700; color:var(--navy); line-height:1.1; margin-bottom:20px; }
        .section { padding:80px; border-bottom:1px solid var(--brd); }
        .sec-title { font-size:24px; font-weight:700; color:var(--p); margin-bottom:30px; border-bottom:2px solid var(--gray); padding-bottom:10px; }
        p { font-size:15px; color:#334155; line-height:1.8; margin-bottom:20px; text-align:justify; }
        table { width:100%; border-collapse:collapse; margin-bottom:30px; border:1px solid var(--brd); border-radius:12px; }
        th { background:var(--bg); padding:15px; text-align:left; font-size:11px; font-weight:800; text-transform:uppercase; border-bottom:1px solid var(--brd); }
        td { padding:15px; border-bottom:1px solid var(--brd); background:#fff; font-size:14px; }
        .price { color:var(--p); font-weight:800; }
    </style>
</head>
<body>
<div class="page">
    <div class="cover">
        <div style="font-size:14px;font-weight:700;color:var(--p);text-transform:uppercase;letter-spacing:3px;margin-bottom:12px;">Strategic Implementation Proposal</div>
        <h1>${title}</h1>
        <div style="font-size:24px;color:var(--slate);margin-bottom:40px;">Tailored for ${company} (Version ${version})</div>
        <div style="background:var(--bg);padding:30px;border-radius:15px;display:grid;grid-template-columns:1fr 1fr;gap:20px;">
            <div><label style="font-size:11px;font-weight:800;color:var(--slate);">REF ID</label><br/><strong>FRAI-${company.substring(0,3).toUpperCase()}-2026</strong></div>
            <div><label style="font-size:11px;font-weight:800;color:var(--slate);">DATE</label><br/><strong>April 10, 2026</strong></div>
        </div>
    </div>
    <div class="section">
        <div class="sec-title">01. Executive Summary</div>
        <p>This proposal outlines a comprehensive Zoho transformation for ${company}. Our goal is to consolidate your current fragmented processes into a high-fidelity CCMS ecosystem that scales with your growth.</p>
        <p>Based on our discovery, we have identified several critical bottlenecks in your Sales and Service pipelines. This solution architected by Fristine AI Architect (OG) addresses these through real-time SAP integration, custom DOP approvals, and automated CAPA tracking.</p>
    </div>
    <div class="section">
        <div class="sec-title">02. Proposed Technical Stack</div>
        <table>
            <thead><tr><th>Product</th><th>Role</th><th>Capabilities</th></tr></thead>
            <tbody>
                <tr><td><strong>Zoho CRM Plus</strong></td><td>Core Hub</td><td>Lead Management, Pipeline Automation</td></tr>
                <tr><td><strong>Zoho Creator</strong></td><td>Custom Logic</td><td>DOP Approvals, SAP Middleware</td></tr>
                <tr><td><strong>Zoho Analytics</strong></td><td>BI Engine</td><td>Unified CXO Dashboards</td></tr>
            </tbody>
        </table>
    </div>
    <div class="section">
        <div class="sec-title">03. Project Commercials</div>
        <p>The total professional services fee for Phase 1 & 2 is detailed below:</p>
        <table>
            <thead><tr><th>Milestone</th><th>Billing Model</th><th>Investment (INR)</th></tr></thead>
            <tbody>
                <tr><td>Discovery & Solution Design</td><td>Fixed Fee</td><td class="price">₹ 1,50,000</td></tr>
                <tr><td>Implementation & Configuration</td><td>T&M Model</td><td class="price">₹ 4,50,000</td></tr>
                <tr><td>User Training & Hypercare</td><td>Go-Live</td><td class="price">₹ 1,20,000</td></tr>
            </tbody>
        </table>
    </div>
</div>
</body>
</html>`;

const PRESET_MOCK_PROPOSALS = {
    'FRIST002': { versions: [
        { version: 1, title: 'Zoho CRM Implementation', created_at: '2026-03-07T12:00:00Z', proposal_html: GET_MOCK_HTML('ACME Corp', 'Zoho CRM Implementation', 1) }
    ] },
    'FRIST007': { versions: [
        { version: 1, title: 'CCMS Enterprise Solution', created_at: '2026-03-29T16:00:00Z', proposal_html: GET_MOCK_HTML('Acme Corp', 'CCMS Enterprise Solution', 1) }, 
        { version: 2, title: 'CCMS Enterprise v2', created_at: '2026-04-01T10:00:00Z', proposal_html: GET_MOCK_HTML('Acme Corp', 'CCMS Enterprise v2 (SAP Integrated)', 2) }
    ]},
};

let _mockMode = false;

export function isMockMode() { return _mockMode; }
export function setMockMode(val) { _mockMode = val; }

export async function reconnect() {
  console.log('[API] Attempting to reconnect to backend...');
  try {
    const res = await fetch(`${BASE}/api/gemini/status`);
    if (res.ok) {
      _mockMode = false;
      console.log('[API] Reconnected successfully. Real mode active.');
      return true;
    }
  } catch (err) {
    console.warn('[API] Reconnect failed:', err);
  }
  return false;
}
let _mockClientStore = [...MOCK_CLIENTS];

function mockAuth() {
  return {
    check: (email) => {
      const e = email.toLowerCase();
      return Promise.resolve({ hasPassword: !!MOCK_AGENTS[e], email: e });
    },
    login: (email, password) => {
      const agent = MOCK_AGENTS[email.toLowerCase()];
      if (!agent) return Promise.reject(Object.assign(new Error('NO_PASSWORD'), { data: { error: 'NO_PASSWORD' } }));
      if (agent.password !== password) return Promise.reject(Object.assign(new Error('WRONG_PASSWORD'), { data: { error: 'WRONG_PASSWORD' } }));
      return Promise.resolve({ success: true, email: agent.email, name: agent.name });
    },
    setPassword: (email, password) => {
      MOCK_AGENTS[email.toLowerCase()] = { email, password, name: email.split('@')[0] };
      return Promise.resolve({ success: true });
    },
  };
}

function mockClients() {
  return {
    list:   ()          => Promise.resolve([..._mockClientStore]),
    get:    (id)        => Promise.resolve(_mockClientStore.find(c => c.client_id === id) || null),
    nextId: ()          => Promise.resolve({ next_id: `DEMO-${String(_mockClientStore.length + 1).padStart(3, '0')}` }),
    create: (data)      => {
      const c = { 
        ...data, 
        client_id: `DEMO-${String(_mockClientStore.length + 1).padStart(3, '0')}`,
        created_at: new Date().toISOString()
      };
      _mockClientStore.push(c);
      return Promise.resolve(c);
    },
    update: (id, data)  => {
      _mockClientStore = _mockClientStore.map(c => c.client_id === id ? { ...c, ...data } : c);
      return Promise.resolve({ success: true });
    },
    delete: (id)        => {
      _mockClientStore = _mockClientStore.filter(c => c.client_id !== id);
      return Promise.resolve({ success: true });
    },
  };
}

function mockTracking() {
  const getKey = (id) => `mock_tracking_${id}`;
  return {
    getEvents: (id) => {
      const data = localStorage.getItem(getKey(id));
      if (data) return Promise.resolve(JSON.parse(data));
      // Fallback to presets
      return Promise.resolve(PRESET_MOCK_EVENTS[id] || []);
    },
    logEvent: (id, event) => {
      const data = localStorage.getItem(getKey(id));
      const evts = data ? JSON.parse(data) : [];
      evts.unshift({ event, timestamp: new Date().toISOString() });
      localStorage.setItem(getKey(id), JSON.stringify(evts));
      return new Promise(res => setTimeout(() => res({ success: true, is_demo: true }), 300));
    },
  };
}

function mockProposals() {
  const getKey = (id) => `mock_proposals_${id}`;
  return {
    get: (id) => {
      const data = localStorage.getItem(getKey(id));
      if (data) return Promise.resolve(JSON.parse(data));
      // Fallback to presets
      return Promise.resolve(PRESET_MOCK_PROPOSALS[id] || null);
    },
    save: (id, html, title) => {
      const data = localStorage.getItem(getKey(id));
      const prev = data ? JSON.parse(data) : { versions: [] };
      const next = { versions: [...prev.versions, { version: prev.versions.length + 1, proposal_html: html, title, created_at: new Date().toISOString() }] };

      localStorage.setItem(getKey(id), JSON.stringify(next));
      return Promise.resolve({ success: true });
    },
    update: (id, html, ver) => Promise.resolve({ success: true }),
  };
}

const _mockTracking  = mockTracking();
const _mockProposals = mockProposals();

/* ══ REAL REQUEST ══════════════════════════════════════════════════════════ */
async function request(method, path, body = null, ignoreMock = false, timeoutMs = 15000) {
  if (_mockMode && !ignoreMock) throw new Error('mock mode');
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  
  const opts = { 
    method, 
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal
  };
  
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${BASE}${path}`, opts);
    clearTimeout(id);
    const text = await res.text().catch(() => '');
    let data = {};
    try { data = JSON.parse(text); } catch { data = { detail: text }; }
    
    if (!res.ok) {
      console.error(`[API Error] ${method} ${path}:`, data);
      const errMsg = data.error || data.detail || `API error (${res.status})`;
      throw Object.assign(new Error(errMsg), { status: res.status, data });
    }
    return data;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      console.error(`[API Timeout] ${method} ${path} timed out after ${timeoutMs}ms`);
      throw new Error(`Request timed out. The backend or tunnel might be slow.`);
    }
    // Check if it's a connection refused / network error
    if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
      console.warn(`[API Connection Failed] Could not reach ${BASE}${path}. Switching to SMART MOCK MODE.`);
      _mockMode = true; // Automatically enable mock mode for this session
      
      // Notify user via a small toast or log (UI might already handle this)
      if (typeof window !== 'undefined') {
        const msg = "Backend unreachable. Running in Demo Mode.";
        console.info(`%c ${msg} `, 'background: #222; color: #bada55');
      }

      // Re-throw to let the caller handle it, or we could transparently retry here.
      // For now, we throw a special error that the UI components might already be tuned to.
      throw new Error(`Connection to backend failed. Smart Mock Mode activated. Please click status badge to retry.`);
    }
    throw err;
  }
}

/* ── Auth ── */
export const auth = {
  check:       (email, password) => _mockMode
    ? mockAuth().check(email)
    : request('GET', `/api/auth/check?email=${encodeURIComponent(email)}`),
  login:       (email, password) => _mockMode
    ? mockAuth().login(email, password)
    : request('POST', '/api/auth/login', { email, password }),
  setPassword: (email, password, name = '') => _mockMode
    ? mockAuth().setPassword(email, password)
    : request('POST', '/api/auth/set-password', { email, password, name }),
};

/* ── Clients ── */
export const clients = {
  list:   ()         => _mockMode ? mockClients().list()        : request('GET',    '/api/clients'),
  get:    (id)       => _mockMode ? mockClients().get(id)       : request('GET',    `/api/clients/${id}`),
  nextId: ()         => _mockMode ? mockClients().nextId()       : request('GET',    '/api/clients/next-id'),
  create: (data)     => _mockMode ? mockClients().create(data)   : request('POST',   '/api/clients', data),
  update: (id, data) => _mockMode ? mockClients().update(id,data): request('PUT',    `/api/clients/${id}`, data),
  delete: (id)       => _mockMode ? mockClients().delete(id)     : request('DELETE', `/api/clients/${id}`),
};

/* ── Tracking ── */
export const tracking = {
  getEvents: (id)         => _mockMode ? _mockTracking.getEvents(id)       : request('GET',  `/api/tracking/${id}`).catch(() => []),
  logEvent:  (id, ev, nt) => _mockMode ? _mockTracking.logEvent(id, ev)    : request('POST', `/api/tracking/${id}`, { event: ev, note: nt }).catch(() => {}),
};

/* ── Proposals ── */
export const proposals = {
  get:    (id)            => _mockMode ? _mockProposals.get(id)             : request('GET',  `/api/proposals/${id}`).catch(() => null),
  save:   (id, html, t)   => _mockMode ? _mockProposals.save(id, html, t)   : request('POST', `/api/proposals/${id}`, { proposal_html: html, title: t }),
  update: (id, html, ver) => _mockMode ? _mockProposals.update(id,html,ver) : request('PUT',  `/api/proposals/${id}`, { proposal_html: html, version: ver }),
};


/* ── Documents ── */
export const documents = {
  parse: async (file) => {
    if (_mockMode) return { text: `[MOCK] Parsed content of ${file.name}. This is simulated text for testing.` };
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE}/api/documents/parse`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || data.detail || 'API error'), { status: res.status, data });
    return data;
  }
};

/* ── Email ── */
export const email = {
  sendBot:      (to, company, clientId, botUrl) => _mockMode
    ? (console.log('[MOCK] Send bot email to', to), new Promise(res => setTimeout(() => res({ success: true, is_demo: true }), 1200)))
    : request('POST', '/api/email/send-bot', { to, company, clientId, botUrl }),
  sendProposal: (to, company, html) => _mockMode
    ? (console.log('[MOCK] Send proposal to', to), new Promise(res => setTimeout(() => res({ success: true, is_demo: true }), 1500)))
    : request('POST', '/api/email/send-proposal', { to, company, html }),
};

/* ── Voice ── */
export const voice = {
  getKey: () => _mockMode ? Promise.resolve({ key: 'mock-key' }) : request('GET', '/api/voice/key'),
  getStatus: () => _mockMode ? Promise.resolve({ status: 'ok', message: 'Demo Mode Active' }) : request('GET', '/api/voice/status'),
  speak:  async (text) => {
    try {
      // Try real TTS even if in mock mode (can't mock audio easily)
      return await request('POST', '/api/voice/speak', { text }, true);
    } catch {
      return { audio: null };
    }
  },
  call: (phone, clientId = null) => {
    console.log(`[API] Triggering call to ${phone} (Client: ${clientId}) via backend...`);
    return _mockMode 
      ? (console.log('[MOCK] Call to', phone), new Promise(res => setTimeout(() => res({ success: true, is_demo: true, call_sid: 'DEMO_' + Date.now() }), 1000))) 
      : request('POST', '/api/voice/call', { phone, client_id: clientId }, false, 25000); 
  },
};


/* ── Gemini ── */
export async function gem(prompt, maxTokens = 1000, temp = 0.7, forcePro = false, history = [], systemInstruction = '') {
  if (_mockMode) {
    // If this is the closure / requirements JSON call
    if (prompt.includes('REQUIREMENTS_COMPLETE') || prompt.includes('JSON SCHEMA') || forcePro) {
      if (prompt.includes('Architect') || prompt.includes('Proposal') || forcePro) {
        // High-fidelity Solution JSON for proposals
        return JSON.stringify({
          title: "Enterprise Zoho CRM & ERP Consolidation",
          about_fristine: "Fristine Infotech is a Premium Zoho Partner specializing in high-security enterprise deployments since 2014.",
          executive_summary: "We propose a unified digital core for your operations, eliminating manual data handling across Sales and Finance. Our solution is designed for 99.9% uptime and scales with your global team.",
          client_objective: "To modernize the discovery-to-delivery lifecycle by implementing a single source of truth for all lead and project data.",
          proposed_solution: "A hybrid architecture leveraging Zoho CRM Plus for customer lifecycle management and Zoho Creator for complex custom workflows and ERP bridges.",
          scope_of_work: "Phase 1: Sales Cloud Implementation | Phase 2: Custom Operations Hub | Phase 3: SAP S/4HANA OData Integration",
          integrations: [
            { item: "SAP S/4HANA", detail: "Real-time bidirectional sync for customer masters and invoices via OData APIs." },
            { item: "WhatsApp Business API", detail: "Automated lead notifications and document deliveries directly from CRM." }
          ],
          data_migration: "Structured migration of 500k+ legacy records from Excel and Tally with 100% data integrity validation.",
          delivery_model: "Agile delivery with bi-weekly sprints, UAT sign-offs for each module, and a dedicated Customer Success Manager.",
          timeline: "14 Weeks (Design: 2w | Build: 8w | Test: 2w | Go-Live: 2w)",
          project_team: "1 Lead Architect, 2 Senior Developers, 1 Quality Analyst, 1 Project Manager.",
          governance: "Weekly steering committee meetings and daily stand-ups following the Fristine Delivery Protocol.",
          detailed_sow: [
            { module: "Sales Automation", features: ["Lead Assignment Rules", "Custom Territory Management", "Automated Quoting"] },
            { module: "Custom ERP Bridge", features: ["OData Endpoint Security", "Data Mapping Engine", "Error Logs Dashboard"] }
          ],
          commercials: [
            { service: "Strategic Solution Design", model: "Fixed", cost: "₹ 1,25,000" },
            { service: "Core Implementation", model: "Lumpsum", cost: "₹ 5,50,000" },
            { service: "Managed Services (Year 1)", model: "Annual", cost: "₹ 2,00,000" }
          ],
          payment_terms: "50% Advance | 30% Post-Testing | 20% Post-Go-Live",
          assumptions_constraints: ["Client provides API access to SAP sandbox.", "Final content for training manuals is provided by the client."],
          run_model: "24/7 technical support and monthly optimization workshops.",
          annexure: "Technical compliance documents and SLA terms are attached as MDD documents."
        });
      }
      // Fallback for simple requirements check
      return `REQUIREMENTS_COMPLETE\n` + JSON.stringify({
        business_overview: "Standard discovery completed.",
        departments: ["Sales"],
        summary: "Lead tracking and automated proposal generation."
      });
    }
    // Opener turn
    if (prompt.includes('PHASE 1') || prompt.includes('Intro')) {
      return `Let's map your requirements to ensure a seamless Zoho transformation. I am the Fristine Strategic Solutions Architect — I'll be guiding you through a quick discovery session to understand your business needs. To start: **what is the single biggest operational bottleneck your team faces today?**`;
    }

    // NEW: Handle Questions in Mock Mode (Fixes Rigidity)
    const lastUserMsg = (history[history.length-1]?.content || "").toLowerCase();
    if (lastUserMsg.includes("fristine") || lastUserMsg.includes("who are you") || lastUserMsg.includes("about")) {
        return `Fristine Infotech is a leading Zoho Premium Partner (since 2014) with offices in Mumbai and Pune. We've successfully completed over 200 Zoho transformations for global clients. Coming back to our discovery... what are your primary goals for this implementation?`;
    }

    // Mid-discovery turns — rotate through MEDDPICC questions
    const questions = [
      `Great insight! To quantify the impact — **how many hours per week does your team spend on manual data entry or reporting?** This helps us size the ROI of automation.`,
      `Understood. On the decision side — **who else besides yourself would be involved in evaluating a Zoho implementation?** Knowing the stakeholders helps us tailor the proposal.`,
      `Got it. Regarding your current tech stack — **which legacy systems (ERP, accounting, or CRM tools) would we need to migrate data from or integrate with?**`,
      `Perfect. Scoping question — **how many users across sales, ops, and finance would be onboarded onto the new Zoho environment?**`,
      `Excellent. Finally — **what does a successful go-live look like for you, and do you have a target timeline in mind?** This will anchor our implementation plan.`,
    ];
    const idx = Math.min(history.length % questions.length, questions.length - 1);
    return questions[idx];
  }
  const data = await request('POST', '/api/gemini/generate', {
    prompt, history, systemInstruction, maxTokens, temperature: temp, forcePro,
  });
  return data.text;
}

export const ai = {
  getStatus: () => _mockMode ? Promise.resolve({ status: 'ok', message: 'Demo Mode Active' }) : request('GET', '/api/gemini/status'),
};

export function safeJ(txt) {
  if (!txt) return null;
  try {
    return JSON.parse(txt.replace(/```json|```/g, '').trim());
  } catch {
    try {
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) return JSON.parse(m[0]);
    } catch {}
    return null;
  }
}
