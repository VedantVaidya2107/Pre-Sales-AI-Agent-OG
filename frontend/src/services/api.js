/* api.js — All backend API calls in one place */

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PROD_URL = 'https://presales-backend-5u8q.onrender.com';
const BASE = (isLocal ? 'http://localhost:8000' : (import.meta.env.VITE_API_URL || PROD_URL)).replace(/\/$/, '');

console.log(`[API] Environment: ${isLocal ? 'DEVELOPMENT (Local)' : 'PRODUCTION'}`);
console.log(`[API] Base URL: ${BASE}`);

/* ══ MOCK MODE (runs when backend is unreachable) ══════════════════════════ */
const MOCK_AGENTS = {
  'test@fristinetech.com':  { email: 'test@fristinetech.com',  password: 'password123',    name: 'Test Agent' },
  'test2@fristinetech.com': { email: 'test2@fristinetech.com', password: 'testpassword123', name: 'Test Agent 2' },
};

const MOCK_CLIENTS = [
  { client_id: 'DEMO-001', company: 'Acme Corp',      industry: 'Manufacturing', email: 'acme@example.com', created_at: '2026-01-15T10:00:00Z' },
  { client_id: 'DEMO-002', company: 'TechStart Ltd',  industry: 'Technology',    email: 'ts@example.com',   created_at: '2026-02-10T14:30:00Z' },
  { client_id: 'DEMO-003', company: 'RetailPro',      industry: 'Retail',        email: 'rp@example.com',   created_at: '2026-03-25T09:15:00Z' },
];

let _mockMode = false;
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
      return Promise.resolve(data ? JSON.parse(data) : []);
    },
    logEvent: (id, event) => {
      const data = localStorage.getItem(getKey(id));
      const evts = data ? JSON.parse(data) : [];
      evts.unshift({ event, timestamp: new Date().toISOString() });
      localStorage.setItem(getKey(id), JSON.stringify(evts));
      return Promise.resolve({ success: true });
    },
  };
}

function mockProposals() {
  const getKey = (id) => `mock_proposals_${id}`;
  return {
    get: (id) => {
      const data = localStorage.getItem(getKey(id));
      return Promise.resolve(data ? JSON.parse(data) : null);
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
async function request(method, path, body = null, ignoreMock = false) {
  if (_mockMode && !ignoreMock) throw new Error('mock mode');
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.detail || 'API error'), { status: res.status, data });
  return data;
}

/* ── Auth ── */
export const auth = {
  check:       (email, password) => _mockMode
    ? mockAuth().check(email)
    : request('GET', `/api/auth/check?email=${encodeURIComponent(email)}`).catch(() => { _mockMode = true; return mockAuth().check(email); }),
  login:       (email, password) => _mockMode
    ? mockAuth().login(email, password)
    : request('POST', '/api/auth/login/', { email, password }).catch(e => { if (e.message === 'Failed to fetch') { _mockMode = true; return mockAuth().login(email, password); } throw e; }),
  setPassword: (email, password, name = '') => _mockMode
    ? mockAuth().setPassword(email, password)
    : request('POST', '/api/auth/set-password/', { email, password, name }).catch(e => {
        console.error('[API] setPassword failed:', e);
        if (_mockMode) return mockAuth().setPassword(email, password);
        throw e;
      }),
};

/* ── Clients ── */
export const clients = {
  list:   ()         => _mockMode ? mockClients().list()        : request('GET',    '/api/clients/').catch(() => { _mockMode = true; return mockClients().list(); }),
  get:    (id)       => _mockMode ? mockClients().get(id)       : request('GET',    `/api/clients/${id}`),
  nextId: ()         => _mockMode ? mockClients().nextId()       : request('GET',    '/api/clients/next-id/'),
  create: (data)     => _mockMode ? mockClients().create(data)   : request('POST',   '/api/clients/', data),
  update: (id, data) => _mockMode ? mockClients().update(id,data): request('PUT',    `/api/clients/${id}`, data),
  delete: (id)       => _mockMode ? mockClients().delete(id)     : request('DELETE', `/api/clients/${id}`),
};

/* ── Tracking ── */
export const tracking = {
  getEvents: (id)         => _mockMode ? _mockTracking.getEvents(id)       : request('GET',  `/api/tracking/${id}/`).catch(() => []),
  logEvent:  (id, ev, nt) => _mockMode ? _mockTracking.logEvent(id, ev)    : request('POST', `/api/tracking/${id}/`, { event: ev, note: nt }).catch(() => {}),
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
    ? (console.log('[MOCK] Send bot email to', to), Promise.resolve({ success: true }))
    : request('POST', '/api/email/send-bot', { to, company, clientId, botUrl }),
  sendProposal: (to, company, html) => _mockMode
    ? (console.log('[MOCK] Send proposal to', to), Promise.resolve({ success: true }))
    : request('POST', '/api/email/send-proposal', { to, company, html }),
};

/* ── Voice ── */
export const voice = {
  getKey: () => _mockMode ? Promise.resolve({ key: 'mock-key' }) : request('GET', '/api/voice/key/'),
  speak:  async (text) => {
    try {
      // Try real TTS even if in mock mode (can't mock audio easily)
      return await request('POST', '/api/voice/speak/', { text }, true);
    } catch {
      return { audio: null };
    }
  },
  call: (phone) => _mockMode ? (console.log('[MOCK] Call to', phone), Promise.resolve({ success: true })) : request('POST', '/api/voice/call/', { phone }),
};


/* ── Gemini ── */
export async function gem(prompt, maxTokens = 1000, temp = 0.7, forcePro = false, history = [], systemInstruction = '') {
  if (_mockMode) {
    // If this is the closure / requirements JSON call
    if (prompt.includes('REQUIREMENTS_COMPLETE') || prompt.includes('JSON SCHEMA') || forcePro) {
      return `REQUIREMENTS_COMPLETE\n` + JSON.stringify({
        business_overview: "A mid-sized technology firm looking to streamline sales and finance operations.",
        departments: ["Sales", "Operations", "Finance"],
        current_tools: ["Excel", "Tally"],
        pain_points: ["Manual data entry consuming 20+ hours/week", "No pipeline visibility"],
        must_have: ["Zoho CRM", "Zoho Books"],
        nice_to_have: ["Zoho Analytics"],
        automation_opportunities: ["Lead assignment rules", "Invoice generation"],
        integrations: ["Email (Gmail)", "WhatsApp Business"],
        success_metrics: ["50% reduction in manual work", "Real-time pipeline dashboard"],
        zoho_products: ["Zoho CRM", "Zoho Books", "Zoho Analytics"],
        user_count: 25,
        industry: "Technology",
        summary: "A comprehensive Zoho CRM + Books implementation for a 25-user tech firm.",
        timeline: "3 months"
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
