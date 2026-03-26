/* api.js — All backend API calls in one place */

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(`${BASE}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.detail || 'API error'), { status: res.status, data });
  return data;
}

/* ── Auth ── */
export const auth = {
  check:       (email) => request('GET', `/api/auth/check?email=${encodeURIComponent(email)}`),
  login:       (email, password) => request('POST', '/api/auth/login/', { email, password }),
  setPassword: (email, password) => request('POST', '/api/auth/set-password/', { email, password }),
};

/* ── Clients ── */
export const clients = {
  list:     ()                        => request('GET',    '/api/clients/'),
  get:      (id)                      => request('GET',    `/api/clients/${id}`),
  nextId:   ()                        => request('GET',    '/api/clients/next-id/'),
  create:   (data)                    => request('POST',   '/api/clients/', data),
  update:   (id, data)                => request('PUT',    `/api/clients/${id}`, data),
  delete:   (id)                      => request('DELETE', `/api/clients/${id}`),
};

/* ── Tracking ── */
export const tracking = {
  getEvents:  (clientId) => request('GET',  `/api/tracking/${clientId}/`),
  logEvent:   (clientId, event, note) => request('POST', `/api/tracking/${clientId}/`, { event, note }),
};

/* ── Proposals ── */
export const proposals = {
  get:   (clientId)               => request('GET',  `/api/proposals/${clientId}/`),
  save:  (clientId, html, title)  => request('POST', `/api/proposals/${clientId}/`, { proposal_html: html, title }),
  update:(clientId, html, version)=> request('PUT',  `/api/proposals/${clientId}/`, { proposal_html: html, version }),
};

/* ── Documents ── */
export const documents = {
  parse: async (file) => {
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
  sendBot: (to, company, clientId, botUrl) =>
    request('POST', '/api/email/send-bot', { to, company, clientId, botUrl }),
  sendProposal: (to, company, html) =>
    request('POST', '/api/email/send-proposal', { to, company, html }),
};

/* ── Voice (Deepgram) ── */
export const voice = {
  getKey: () => request('GET', '/api/voice/key/'),
  speak:  (text) => request('POST', '/api/voice/speak/', { text }),
};

/* ── Gemini (proxied through backend — key stays server-side) ── */
export async function gem(prompt, maxTokens = 1000, temp = 0.7, forcePro = false, history = [], systemInstruction = '') {
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
