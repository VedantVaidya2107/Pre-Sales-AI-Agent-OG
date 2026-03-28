import '../style.css';
import { auth, clients, tracking, proposals, email, documents, gem, voice, safeJ } from './services/api.js';
import mammoth from 'mammoth';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } from 'docx';
import { saveAs } from 'file-saver';
import gsap from 'gsap';

/* ══ CONFIG ══ */
const DEPLOY_URL = (window.location.origin + window.location.pathname).replace(/\/index\.html$/, '').replace(/\/$/, '');

/* ══ STATE ══ */
let allClients = [];
let cli = null, prof = null, convo = [], reqs = null, sol = null;
let phase = 'login', rn = 0, discoveryComplete = false;
let pendingBlob = null, pendingName = '';
let fileContent = '';
let currentTrackingClient = null;
let activeClientId = null;
let activeKpiFilter = 'all';
let clientStatuses = {};
let callingMode = false;
let voiceEnabled = false; 
let audioContext = null;
let currentAudioSource = null; 
let voiceQueue = [];
let isProcessingVoice = false;


/* ══ ENHANCED ZOHO KNOWLEDGE BASE WITH NATURAL LANGUAGE UNDERSTANDING ══ */
const ZK = `# ROLE
You are the Fristine Strategic Solutions Architect, representing Fristine Infotech, India's leading Premium Zoho Partner. Your goal is to conduct a world-class MEDDPICC-driven discovery session to generate high-accuracy Proposals, BRDs, and FSDs.

# OPERATIONAL PROTOCOL
1. Tone: Consultative, expert-level, and professional with a touch of wit.
2. Methodology (MEDDPICC): You must identify Metrics, Economic Buyer, Decision Criteria, Decision Process, Paper Process, Identify Pain, and the Champion.
3. Zoho Expertise: Recommend specific Zoho modules (CRM, Books, Analytics, Creator, Desk) based on identified bottlenecks.
4. Data Extraction: Continuously extract user count, legacy systems for migration, and go-live timelines.

# CALLING AGENT FEATURE (TRIGGER)
You are equipped with a Human-in-the-Loop trigger. If the user requests a human, expresses high-value urgency, or asks for a "call," you must execute the following:
- Phrase: "I have notified the Fristine Presales Team. A Senior Consultant will review our conversation history and reach out to you immediately via your registered portal ID."
- Internal Action: Signal the system to trigger the HUMAN_INTERVENTION_REQ event in the tracking logs.

# CONVERSATION STRUCTURE
- Phase 1 (Intro): Set the agenda. "Let’s map your requirements to ensure a seamless Zoho transformation."
- Phase 2 (Pain & Metrics): Identify what is broken. "What is the cost of your current manual processes in terms of hours or revenue?"
- Phase 3 (Scoping): Technical discovery. "How many users will be onboarded, and which legacy systems are we replacing?"
- Phase 4 (Validation): Confirm the Decision Process. "Who besides yourself needs to review the final Functional Specification Document (FSD)?"
- Phase 5 (Proposal Initiation): Confirm the requirements. If the user agrees or asks to proceed, output the keyword INITIATE_PROPOSAL_BUILD.
- Phase 6 (Closure): Inform the user that the custom proposal is being built and will open shortly.

# CONSTRAINTS
- Keep responses concise (under 100 words).
- If the user is vague, push for technical specifics.
- If the user says "Yes," "Proceed," "Go ahead," or "Build it" after seeing the requirements, you MUST include the keyword INITIATE_PROPOSAL_BUILD in your response.
- Support Hinglish context but maintain a professional English output.
- Ensure all collected data is structured internally for the /api/generate-docs endpoint.`;

/* ══ PROPOSAL SPECIALIST MODE (FOR DOCUMENT GENERATION) ══ */
const PROPOSAL_SPECIALIST_PROMPT = `Role: Expert Proposal Specialist & Data Analyst.

Critical Instruction (File Handling):
1. Tool Priority: Before responding, you MUST parse and analyze the attached PDF/DOCX. You are strictly prohibited from using generic placeholders. 
2. The "Null" Fix: If the requirement extraction returns a null value or an error, do NOT attempt to process it with code logic. Instead, immediately trigger the error message: "CRITICAL ERROR: Unable to read attachment. Please ensure 'File Search' is enabled in the agent settings or paste the text directly."
3. Requirement Extraction: Upon successful parsing, you must list: Client Name, Primary Goal, and 3-5 Technical Requirements found in the document.
4. Drafting Protocol: Use the professional Fristine template as a skeleton. Do not "copy-paste." You must rewrite the "Solution" and "Value Proposition" sections to be long-form (3+ paragraphs each), detailing specific integrations for Zoho CRM, Analytics, Projects, or Desk as mentioned in the requirements.
5. Grammar & Tone: Use active voice, professional business English, and perfect grammar.
6. Zoho Data Sync: Conclude with a structured summary table for Zoho CRM: Lead Name, Estimated Value, and Implementation Timeline.

Task: Analyze the attached requirement document and generate a comprehensive, highly customized technical proposal with Data Analyst precision.`;

/* ══ BOOT ══ */
async function init() {
    initTheme();
    initPasswordToggle();
    initKpis();
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('client');

    if (clientId) {
        activeClientId = clientId;
        await bootClientSession(clientId);
    } else {
        await bootStaffLogin();
    }
}

async function bootStaffLogin() {
    showLdr('Connecting to portal…');
    const wakeUpTimer = setTimeout(() => {
        setSS('ok', 'Render service is cold-starting... please wait ~60s');
    }, 6000);

    try {
        allClients = await clients.list();
        clearTimeout(wakeUpTimer);
        setSS('ok', `Connected · ${allClients.length} clients loaded`);
        const activeAgent = localStorage.getItem('f_active_agent');
        if (activeAgent) {
            startStaffPortal(activeAgent);
        }
    } catch (e) {
        clearTimeout(wakeUpTimer);
        // Mock mode kicks in automatically — show demo mode status
        try {
            allClients = await clients.list();
            setSS('ok', `Demo Mode · ${allClients.length} sample clients loaded`);
            const activeAgent = localStorage.getItem('f_active_agent');
            if (activeAgent) startStaffPortal(activeAgent);
        } catch {
            setSS('er', 'Could not connect to backend — is the server running?');
            console.error('[Boot]', e);
        }
    }
    hideLdr();
}


async function bootClientSession(clientId) {
    showLdr('Loading your session…');
    const wakeUpTimer = setTimeout(() => {
        showLdr('Server is waking up (Render free tier may take a moment)...');
    }, 6000);

    try {
        allClients = await clients.list();
        clearTimeout(wakeUpTimer);
    } catch (e) {
        clearTimeout(wakeUpTimer);
        console.warn('[Boot] client list failed', e);
    }

    const found = allClients.find(c => (c.client_id || '').toLowerCase() === clientId.toLowerCase());
    if (found) {
        cli = found;
        await tracking.logEvent(clientId, 'bot_accessed');
        startSession();
    } else {
        show('L');
        setSS('er', 'Invalid session link. Contact Fristine Infotech.');
        document.getElementById('em').closest('.field').style.display = 'none';
        document.getElementById('pw').closest('.field').style.display = 'none';
        document.getElementById('loginBtn').style.display = 'none';
    }
    hideLdr();
}

/* ══ AUTH ══ */
function setSS(type, txt) {
    const el = document.getElementById('ss');
    el.className = 'conn-status ' + type;
    document.getElementById('stxt').textContent = txt;
    const dot = document.getElementById('sdot');
    dot.className = type === 'ok' ? 'cs-dot' : 'cs-dot spin';
}

document.getElementById('loginBtn').addEventListener('click', async () => {
    const em = document.getElementById('em').value.trim().toLowerCase();
    const pw = document.getElementById('pw').value.trim();
    const err = document.getElementById('lerr');
    err.textContent = '';

    if (!em.endsWith('@fristinetech.com')) {
        err.textContent = 'Access restricted to @fristinetech.com accounts.';
        return;
    }

    const btn = document.getElementById('loginBtn');
    btn.disabled = true; btn.querySelector('span').textContent = 'Signing in…';

    try {
        const check = await auth.check(em);
        if (!check.hasPassword) {
            // First time — go to set password screen
            hide('L'); show('SP');
            document.getElementById('sp-email-show').textContent = `Setting up account for ${em}`;
            document.getElementById('SP').dataset.email = em;
            if (pw) document.getElementById('sp-pw1').value = pw;
            return;
        }

        await auth.login(em, pw);
        localStorage.setItem('f_active_agent', em);
        allClients = await clients.list();
        startStaffPortal(em);
    } catch (e) {
        if (e.data?.error === 'NO_PASSWORD') {
            hide('L'); show('SP');
            document.getElementById('sp-email-show').textContent = `Setting up account for ${em}`;
            document.getElementById('SP').dataset.email = em;
        } else if (e.data?.error === 'WRONG_PASSWORD') {
            err.textContent = 'Incorrect password. Use "Forgot Password?" to reset.';
        } else {
            err.textContent = e.message || 'Login failed. Is the backend running?';
        }
    } finally {
        btn.disabled = false; btn.querySelector('span').textContent = 'Sign In';
    }
});

document.getElementById('pw').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('forgotLink').addEventListener('click', () => {
    hide('L'); show('FP');
    document.getElementById('fp-form-wrap').style.display = '';
    document.getElementById('fp-success').classList.add('hidden');
});

document.getElementById('setPwBtn').addEventListener('click', async () => {
    const email_ = document.getElementById('SP').dataset.email;
    const pw1 = document.getElementById('sp-pw1').value.trim();
    const pw2 = document.getElementById('sp-pw2').value.trim();
    const err = document.getElementById('sp-err');
    err.textContent = '';
    if (pw1.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
    if (pw1 !== pw2)    { err.textContent = 'Passwords do not match.'; return; }
    try {
        await auth.setPassword(email_, pw1);
        localStorage.setItem('f_active_agent', email_);
        allClients = await clients.list();
        hide('SP');
        startStaffPortal(email_);
    } catch (e) {
        err.textContent = e.message;
    }
});

document.getElementById('resetPwBtn').addEventListener('click', async () => {
    const em   = document.getElementById('fp-em').value.trim().toLowerCase();
    const pw1  = document.getElementById('fp-pw1').value.trim();
    const pw2  = document.getElementById('fp-pw2').value.trim();
    const err  = document.getElementById('fp-err');
    err.textContent = '';
    if (!em.endsWith('@fristinetech.com')) { err.textContent = 'Must be a @fristinetech.com email.'; return; }
    if (pw1.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
    if (pw1 !== pw2)    { err.textContent = 'Passwords do not match.'; return; }
    try {
        await auth.setPassword(em, pw1);
        document.getElementById('fp-form-wrap').style.display = 'none';
        document.getElementById('fp-success').classList.remove('hidden');
    } catch (e) {
        err.textContent = e.message;
    }
});

document.getElementById('backToLoginFromFP').addEventListener('click', () => { hide('FP'); show('L'); });
document.getElementById('backToLoginBtn2').addEventListener('click', () => { hide('FP'); show('L'); });

/* ══ STAFF PORTAL ══ */
async function startStaffPortal(agentEmail) {
    if (agentEmail) document.getElementById('agentChip').textContent = agentEmail.split('@')[0];
    hide('L'); hide('SP'); hide('FP');
    show('H');
    await renderClientTable();
    animateDashboardEntrance();
}

function animateDashboardEntrance() {
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(c => c.classList.add('anim-in'));

    gsap.from('.dash-topbar', { opacity: 0, y: -20, duration: 0.5, ease: 'power3.out' });
    gsap.from('.table-wrap', { opacity: 0, y: 20, duration: 0.5, delay: 0.3, ease: 'power3.out' });
}

async function loadClientStatuses() {
    clientStatuses = {};
    for (const c of allClients) {
        try { 
            const evts = await tracking.getEvents(c.client_id || ''); 
            clientStatuses[c.client_id] = getClientStatus(evts || []);
        } catch {
            clientStatuses[c.client_id] = getClientStatus([]);
        }
    }
}

function initKpis() {
    const kpis = [
        { id: 'statTotal', filter: 'all' },
        { id: 'statSent', filter: 'sent' },
        { id: 'statActive', filter: 'active' },
        { id: 'statProposal', filter: 'proposal' }
    ];
    setTimeout(() => {
        kpis.forEach(k => {
            const el = document.getElementById(k.id)?.closest('.stat-card');
            if (!el) return;
            el.style.cursor = 'pointer';
            el.addEventListener('click', () => {
                activeKpiFilter = k.filter;
                document.querySelectorAll('.stat-card').forEach(c => c.style.borderColor = 'var(--brd)');
                el.style.borderColor = 'var(--orange)';
                renderClientTable(document.getElementById('searchInput').value.trim().toLowerCase(), false);
            });
            if (k.filter === 'all') el.style.borderColor = 'var(--orange)';
        });
    }, 100);
}

async function renderClientTable(filter = '', forceRefresh = true) {
    const tbody = document.getElementById('clientTableBody');
    if (forceRefresh) {
        try { allClients = await clients.list(); } catch (e) { console.warn('[Table] Could not refresh clients:', e); }
        await loadClientStatuses();
    }

    let sentCount = 0, activeCount = 0, proposalCount = 0;
    allClients.forEach(c => {
        const s = clientStatuses[c.client_id];
        if (s) {
            if (s.sent || s.accessed) sentCount++;
            if (s.active) activeCount++;
            if (s.totalProposal) proposalCount++;
        }
    });

    document.getElementById('clientCount').textContent = `${allClients.length} clients in pipeline`;
    document.getElementById('statTotal').textContent = allClients.length;
    document.getElementById('statSent').textContent = sentCount;
    document.getElementById('statActive').textContent = activeCount;
    document.getElementById('statProposal').textContent = proposalCount;

    let filtered = allClients;
    if (filter) {
        filtered = filtered.filter(c => 
            (c.company || '').toLowerCase().includes(filter) ||
            (c.email || '').toLowerCase().includes(filter) ||
            (c.industry || '').toLowerCase().includes(filter)
        );
    }
    
    if (activeKpiFilter !== 'all') {
        filtered = filtered.filter(c => {
            const s = clientStatuses[c.client_id];
            if (!s) return false;
            if (activeKpiFilter === 'sent') return s.sent || s.accessed;
            if (activeKpiFilter === 'active') return s.active;
            if (activeKpiFilter === 'proposal') return s.totalProposal;
            return true;
        });
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="tbl-empty">${filter || activeKpiFilter !== 'all' ? 'No results found.' : 'No clients yet. Add a lead to get started.'}</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    for (const client of filtered) {
        const clientId = client.client_id || '';
        const status = clientStatuses[clientId] || getClientStatus([]);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div class="tbl-co-wrap">
                    <div class="tbl-co-ico">${(client.company || '?')[0].toUpperCase()}</div>
                    <div>
                        <div class="tbl-co-name">${client.company || '—'}</div>
                        <div class="tbl-co-id">${clientId || '—'}</div>
                    </div>
                </div>
            </td>
            <td><span class="tbl-industry">${client.industry || '—'}</span></td>
            <td><span class="tbl-email">${client.email || '—'}</span></td>
            <td>${renderStatusBadge(status)}</td>
            <td>
                <div class="tbl-actions">
                    <button class="btn-tbl btn-tbl-send">Send Bot</button>
                    <button class="btn-tbl btn-tbl-track">Track</button>
                    <button class="btn-tbl btn-tbl-del">Delete</button>
                </div>
            </td>`;
        tbody.appendChild(tr);
        tr.querySelector('.btn-tbl-send').onclick  = () => sendBotEmail(clientId);
        tr.querySelector('.btn-tbl-track').onclick = () => openTracking(clientId);
        tr.querySelector('.btn-tbl-del').onclick   = () => deleteLead(clientId);
        tr.querySelector('.tbl-co-name').onclick   = () => openTracking(clientId);
    }

    const rows = tbody.querySelectorAll('tr');
    rows.forEach((row, i) => setTimeout(() => row.classList.add('anim-in'), i * 50));
}

function getClientStatus(events) {
    const names = events.map(e => e.event);
    const isSubmitted = names.includes('proposal_submitted');
    const isProposal  = names.includes('proposal_generated');
    const isActive    = names.includes('conversation_started');
    const isAccessed  = names.includes('bot_accessed');
    const isSent      = names.includes('bot_sent');
    
    return {
        submitted: isSubmitted,
        proposal: isProposal && !isSubmitted,
        active: isActive && !isProposal && !isSubmitted,
        accessed: isAccessed && !isActive && !isProposal && !isSubmitted,
        sent: isSent && !isAccessed && !isActive && !isProposal && !isSubmitted,
        totalProposal: isProposal || isSubmitted
    };
}

function renderStatusBadge(s) {
    if (s.submitted) return '<span class="badge badge-done"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M3.5 8l3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Submitted</span>';
    if (s.proposal)  return '<span class="badge badge-proposal"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> Proposal Ready</span>';
    if (s.active)    return '<span class="badge badge-active"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M2 4h12v7a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" stroke="currentColor" stroke-width="1.5"/><path d="M5 7.5h6M5 10h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> In Session</span>';
    if (s.accessed)  return '<span class="badge badge-accessed"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/></svg> Accessed</span>';
    if (s.sent)      return '<span class="badge badge-sent"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M2 4l6 4 6-4M2 4h12v8H2V4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Sent</span>';
    return '<span class="badge badge-pending"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Not Started</span>';
}

/* ── Search ── */
document.getElementById('searchInput').addEventListener('input', e => {
    renderClientTable(e.target.value.trim().toLowerCase());
});
document.getElementById('refreshBtn').addEventListener('click', () => renderClientTable());

/* ══ SEND BOT EMAIL ══ */
async function sendBotEmail(clientId) {
    const client = allClients.find(c => c.client_id === clientId);
    if (!client) return;
    const botUrl = `${DEPLOY_URL}/?client=${encodeURIComponent(clientId)}`;
    try {
        await email.sendBot(client.email, client.company, clientId, botUrl);
        await tracking.logEvent(clientId, 'bot_sent');
        showToast('Bot link sent!', 'success');
        renderClientTable();
    } catch (e) {
        showToast('Failed to send email: ' + e.message, 'error');
    }
}

/* ══ LEAD MANAGEMENT ══ */
document.getElementById('openCreateBtn').addEventListener('click', async () => {
    openModal('createLeadModal');
    try {
        const data = await clients.nextId();
        document.getElementById('nl-id-preview').textContent = data.next_id;
    } catch {}
});

document.getElementById('closeCreateBtn').addEventListener('click', () => closeModal('createLeadModal'));
document.getElementById('cancelCreateBtn')?.addEventListener('click', () => closeModal('createLeadModal'));

window.previewClientId = function () {};

document.getElementById('saveLeadBtn').addEventListener('click', async () => {
    const co  = document.getElementById('nl-co').value.trim();
    const ind = document.getElementById('nl-ind').value.trim();
    const em  = document.getElementById('nl-em').value.trim();
    if (!co || !em) { showToast('Company and email are required.', 'error'); return; }

    const btn = document.getElementById('saveLeadBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
        await clients.create({ company: co, industry: ind, email: em });
        showToast('Lead created!', 'success');
        closeModal('createLeadModal');
        ['nl-co', 'nl-ind', 'nl-em'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('nl-id-preview').textContent = '—';
        await renderClientTable();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    } finally {
        btn.textContent = 'Create Lead'; btn.disabled = false;
    }
});

async function deleteLead(clientId) {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    try {
        await clients.delete(clientId);
        showToast('Lead deleted.', 'success');
        renderClientTable();
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

/* ══ TRACKING PAGE ══ */
async function openTracking(clientId) {
    const client = allClients.find(c => c.client_id === clientId);
    if (!client) return;
    currentTrackingClient = client;

    hide('H'); show('T');
    // Animate tracking page entrance
    gsap.from('.client-hero', { y: -20, opacity: 0, duration: 0.4, ease: 'power3.out' });
    gsap.from('.section-card', { y: 20, opacity: 0, duration: 0.4, stagger: 0.08, delay: 0.15, ease: 'power3.out' });
    gsap.from('.two-col-grid', { y: 20, opacity: 0, duration: 0.4, delay: 0.3, ease: 'power3.out' });
    document.getElementById('trackingClientName').textContent = client.company || 'Client';
    document.getElementById('tClientIco').textContent  = (client.company || '?')[0].toUpperCase();
    document.getElementById('tClientName').textContent = client.company || '—';
    document.getElementById('tClientMeta').textContent = `${client.industry || '—'} · ${client.email || '—'}`;
    document.getElementById('tClientId').textContent   = `Client ID: ${clientId}`;

    showLdr('Loading tracking data…');
    let evts = [];
    try { evts = await tracking.getEvents(clientId); } catch {}
    hideLdr();

    renderPipeline(evts);
    renderEventLog(evts);

    const ps = document.getElementById('proposalSection');
    try { 
        const pData = await proposals.get(clientId); 
        if (pData && pData.versions && pData.versions.length > 0) {
            ps.style.display = 'block';
            let html = '<div class="section-title">Generated Proposals</div><div style="display:flex;flex-direction:column;gap:12px;">';
            
            const rev = [...pData.versions].reverse();
            rev.forEach(v => {
                const dateRaw = new Date(v.savedAt);
                const dateStr = isNaN(dateRaw) ? v.savedAt : dateRaw.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
                
                html += `
                    <div class="proposal-banner">
                        <div class="proposal-banner-icon"><svg viewBox="0 0 20 20" fill="none" width="28"><rect x="5" y="4" width="10" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M8 2h4a1 1 0 011 1v1H7V3a1 1 0 011-1z" stroke="currentColor" stroke-width="1.5"/><path d="M8 10h4M8 14h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg></div>
                        <div class="proposal-banner-text">
                            <div class="proposal-banner-title">Version ${v.version} ${v.version === pData.versions.length ? '<span style="color:var(--green);font-size:11px;margin-left:6px">(Latest)</span>' : ''}</div>
                            <div class="proposal-banner-sub">${dateStr}</div>
                        </div>
                        <div class="proposal-banner-actions">
                            <button class="btn-primary btn-sm view-ver-btn" data-v="${v.version}">View Proposal</button>
                            <button class="btn-success btn-sm send-ver-btn" data-v="${v.version}">Send</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            ps.innerHTML = html;
            
            ps.querySelectorAll('.view-ver-btn').forEach(btn => {
                btn.onclick = () => {
                    const ver = pData.versions.find(x => x.version == btn.dataset.v);
                    document.getElementById('proposalIframe').srcdoc = ver.proposal_html;
                    document.getElementById('proposalModal').dataset.version = ver.version;
                    openModal('proposalModal');
                };
            });
            ps.querySelectorAll('.send-ver-btn').forEach(btn => {
                btn.onclick = async () => {
                    const ver = pData.versions.find(x => x.version == btn.dataset.v);
                    btn.disabled = true;
                    btn.textContent = 'Sending...';
                    try {
                        await email.sendProposal(client.email, client.company, ver.proposal_html);
                        await tracking.logEvent(clientId, 'proposal_submitted');
                        const evts2 = await tracking.getEvents(clientId);
                        renderPipeline(evts2);
                        renderEventLog(evts2);
                        showToast('Proposal Version ' + btn.dataset.v + ' securely sent to client!', 'success');
                    } catch (e) {
                        showToast('Failed to send email: ' + e.message, 'error');
                    } finally {
                        btn.disabled = false;
                        btn.textContent = 'Send';
                    }
                };
            });
        } else {
            ps.style.display = 'none';
        }
    } catch {
        ps.style.display = 'none';
    }

    renderClientFiles(clientId);

    document.getElementById('resendBotBtn').onclick = () => sendBotEmail(clientId);
    document.getElementById('copyLinkBtn').onclick = () => {
        const url = `${DEPLOY_URL}/?client=${encodeURIComponent(clientId)}`;
        navigator.clipboard.writeText(url).then(() => {
            document.getElementById('copyLinkBtn').textContent = 'Copied!';
            setTimeout(() => { document.getElementById('copyLinkBtn').innerHTML = `<svg viewBox="0 0 20 20" fill="none" width="14" height="14"><rect x="7" y="7" width="10" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 13V3h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copy Link`; }, 2000);
        });
    };
}

function renderPipeline(evts) {
    const map = {};
    evts.forEach(e => { if (!map[e.event]) map[e.event] = e.timestamp; });
    const stages = [
        { key: 'bot_sent', id: 0 },
        { key: 'bot_accessed', id: 1 },
        { key: 'conversation_started', id: 2 },
        { key: 'proposal_generated', id: 3 },
        { key: 'proposal_submitted', id: 4 },
    ];
    stages.forEach(({ key, id }) => {
        const step = document.getElementById(`ps${id}`);
        const time = document.getElementById(`pt${id}`);
        const conn = document.getElementById(`pc${id-1}${id}`);
        if (map[key]) {
            step.classList.add('done'); step.classList.remove('active');
            time.textContent = formatTime(map[key]);
            if (conn) conn.classList.add('done');
        } else {
            step.classList.remove('done', 'active');
            time.textContent = '—';
        }
    });
}

function renderEventLog(evts) {
    const log = document.getElementById('eventLog');
    const evtIcons = {
        'bot_sent':             '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><path d="M2 5l7 4 7-4M2 5h14v9H2V5z" stroke="var(--amber)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'bot_accessed':         '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><path d="M9 4C5 4 1.5 9 1.5 9S5 14 9 14s7.5-5 7.5-5S13 4 9 4z" stroke="#2563EB" stroke-width="1.5"/><circle cx="9" cy="9" r="2" stroke="#2563EB" stroke-width="1.5"/></svg>',
        'conversation_started': '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><path d="M2 5h14v8a1 1 0 01-1 1H6l-3 2v-2H2V5z" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'proposal_generated':   '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><rect x="4" y="2" width="10" height="14" rx="2" stroke="#7C3AED" stroke-width="1.5"/><path d="M7 6h4M7 9h4M7 12h2" stroke="#7C3AED" stroke-width="1.3" stroke-linecap="round"/></svg>',
        'proposal_submitted':   '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><circle cx="9" cy="9" r="7" stroke="var(--green)" stroke-width="1.5"/><path d="M6 9l2.5 2.5L12.5 7" stroke="var(--green)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        'proposal_sent':        '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><path d="M2 5l7 4 7-4M2 5h14v9H2V5z" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 12l2 2 3-4" stroke="var(--green)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
    const evtLabels = {
        'bot_sent':              'Bot link sent to client',
        'bot_accessed':          'Client accessed the bot',
        'conversation_started':  'Client started a conversation',
        'proposal_generated':    'Proposal generated',
        'proposal_submitted':    'Proposal submitted to agent',
        'proposal_sent':         'Proposal sent to client',
    };
    if (!evts.length) {
        log.innerHTML = '<div class="event-empty">No activity recorded yet.</div>';
        return;
    }
    log.innerHTML = [...evts].reverse().map(e => `
        <div class="event-row">
            <div class="event-icon">${evtIcons[e.event] || '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><circle cx="9" cy="9" r="7" stroke="var(--dim)" stroke-width="1.5"/></svg>'}</div>
            <div class="event-desc">${evtLabels[e.event] || e.event}</div>
            <div class="event-time">${formatTime(e.timestamp)}</div>
        </div>`).join('');
}

function formatTime(ts) {
    try { return new Date(ts).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
    catch { return ts || '—'; }
}

/* ══ CLIENT BOT SESSION ══ */
async function startSession() {
    hide('L'); show('A');
    // Animate bot layout entrance
    gsap.from('.bot-header', { y: -30, opacity: 0, duration: 0.4, ease: 'power3.out' });
    gsap.from('.bot-sidebar', { x: -30, opacity: 0, duration: 0.5, delay: 0.15, ease: 'power3.out' });
    gsap.from('.chat-panel', { opacity: 0, duration: 0.4, delay: 0.2, ease: 'power2.out' });
    document.getElementById('topco').textContent  = cli.company;
    document.getElementById('topco-ico').textContent = (cli.company || '?')[0].toUpperCase();
    document.getElementById('sbi').textContent    = cli.industry || 'Detecting…';
    document.getElementById('sbs').textContent    = cli.size || '—';

    const restored = activeClientId ? loadConversationMemory(activeClientId) : false;

    if (restored && convo.length > 0) {
        setStg(0, 'done'); setStg(1, 'done');
        if (prof) renderSidebar();
        const feed = document.getElementById('feed');
        feed.innerHTML = '';
        convo.forEach(msg => {
            if (msg.role === 'assistant') addAg(msg.content);
            else if (msg.role === 'user' && !msg.content.startsWith('[File uploaded:')) addUs(msg.content);
        });
        if (discoveryComplete && reqs) {
            setStg(2, 'done'); setStg(3, 'act');
            showReqSummary();
        } else {
            setStg(2, 'act'); setPhase('Discovery Phase');
            addAg(`Welcome back! I remember our conversation. Where were we — shall we continue?`);
        }
        return;
    }

    setStg(0, 'act'); setPhase('Researching your company…');
    showLdr('Researching ' + cli.company + '…');
    try {
        const res = await gem(
            `Research "${cli.company}". Industry: ${cli.industry}. Size: ${cli.size}.\nReturn JSON: {"industries":["..."],"description":"...","pain_points":["..."],"tech":"...","zoho_fit":["..."],"user_est":{"CRM":10}}`,
            1000, 0.3, false, [], ZK
        );
        prof = safeJ(res) || fallback();
        renderSidebar();
    } catch (e) {
        prof = fallback();
    }
    hideLdr();
    setStg(0, 'done');

    const inds = getInds();
    if (inds.length > 1) {
        setStg(1, 'act'); setPhase('Confirming Industry Focus…');
        askInd(inds);
    } else {
        prof.confirmed = inds[0] || cli.industry;
        setStg(1, 'done');
        beginGather();
    }
}

function renderSidebar() {
    document.getElementById('sbi').textContent = (prof.industries || [cli.industry]).join(' · ');
    document.getElementById('sbs').textContent = prof.size || cli.size || 'Medium';
    document.getElementById('sbt').textContent = prof.tech || 'High';
    updateCov(20);
}

function fallback() {
    return { industries: [cli.industry || 'Technology'], size: cli.size || 'Medium', pain_points: ['Process Optimisation'], tech: 'Medium', zoho_fit: ['Zoho CRM'], confirmed: cli.industry };
}

function getInds() {
    let inds = prof.industries || [];
    if (!inds.length) inds = (cli.industry || '').split(',').map(s => s.trim()).filter(Boolean);
    return [...new Set(inds)];
}

function askInd(inds) {
    addAg(`Welcome! I've researched <strong>${cli.company}</strong>. Which sector should we focus on today?`, { inds });
}

async function beginGather() {
    setStg(2, 'act'); setPhase('Discovery Phase: Requirements'); phase = 'gather';
    if (activeClientId) await tracking.logEvent(activeClientId, 'conversation_started').catch(() => {});
    showLdr('Tailoring consultation…');
    try {
        const open = await nextQ(true);
        addAg(open);
        convo.push({ role: 'assistant', content: open });
    } catch (e) {
        addAg(`I'm ready to dive in! Based on our research into ${cli.company}, what are the high-priority challenges you'd like to solve?`);
    }
    hideLdr();
}

async function nextQ(isOpen = false) {
    const sys = `${ZK}\n\nRESEARCH CONTEXT for ${cli.company}:\n${JSON.stringify(prof)}\n${fileContent ? `UPLOADED FILE:\n${fileContent}\n` : ''}`;

    const phaseMap = {
        0: 'Phase 1: Intro',
        1: 'Phase 2: Pain & Metrics',
        2: 'Phase 3: Scoping',
        3: 'Phase 4: Validation',
        4: 'Phase 5: Closure'
    };

    let turnPrompt;
    if (isOpen) {
        turnPrompt = `PHASE 1 (Intro): Set the agenda for a consultation with ${cli.company}. Start with: "Let’s map your requirements to ensure a seamless Zoho transformation. I am the Fristine Strategic Solutions Architect..."`;
    } else if (rn >= 10) {
        turnPrompt = `PHASE 5 (Closure): Inform the user that the sessions is concluding and you're compiling the Proposal, BRD, and FSD.
Output REQUIREMENTS_COMPLETE followed by the full JSON summary.
JSON SCHEMA: {
  "business_overview": "Summary of requirements",
  "departments": ["Teams involved"],
  "current_tools": ["Legacy systems"],
  "pain_points": ["Bottlenecks in hours or revenue"],
  "must_have": ["Critical features"],
  "nice_to_have": ["Bonus features"],
  "automation_opportunities": ["Manual tasks to automate"],
  "integrations": ["Existing ecosystem to sync"],
  "success_metrics": ["User count, revenue, or time targets"],
  "zoho_products": ["Recommended Zoho modules"],
  "user_count": 0,
  "industry": "Industry Type",
  "summary": "Closing design overview",
  "timeline": "Go-live timeline"
}`;
    } else {
        const curPhaseId = Math.floor(rn / 2); // Simple progression through 5 phases over 10 turns
        const curPhase = phaseMap[curPhaseId] || phaseMap[4];
        turnPrompt = `Current Phase: ${curPhase}. Conduct discovery for ${cli.company}. 
Identify MEDDPICC elements (Metrics, Economic Buyer, Decision Criteria, Process, Pain, Champion).
Keep it concise (<100 words). Ask one technical specific question.`;
    }

    const resp = await gem(turnPrompt, rn >= 10 ? 2000 : 1000, 0.7, rn >= 10, convo, sys);
    
    // HUMAN_INTERVENTION_REQ Trigger Detection
    if (resp && resp.includes("I have notified the Fristine Presales Team. A Senior Consultant will review our conversation history")) {
        if (activeClientId) {
            tracking.logEvent(activeClientId, 'HUMAN_INTERVENTION_REQ').catch(() => {});
        }
    }
    
    return resp;
}

/* ── File upload ── */
document.getElementById('fileBtn').onclick = () => document.getElementById('fileIn').click();

document.getElementById('fileIn').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    showLdr(`Reading ${f.name}…`);
    addUs(`[Uploaded: ${f.name}]`);

    try {
        // Process supported documents (PDF, DOCX, TXT) via the robust Python backend parser
        if (['.pdf', '.docx', '.txt', '.csv'].some(ext => f.name.toLowerCase().endsWith(ext)) || f.type.startsWith('application/')) {
            showLdr(`Analyzing ${f.name}…`, 50);
            showTypingIndicator();

            const parsed = await documents.parse(f);
            fileContent = parsed.text || "";
            if (fileContent.length > 15000) fileContent = fileContent.slice(0, 15000);
            
            saveFileToMemory(activeClientId, { name: f.name, type: f.type, size: f.size }, fileContent);
            convo.push({ role: 'user', content: `[File uploaded: ${f.name}]\n\nFile contents:\n${fileContent}` });

            rn++;
            const sys = `${ZK}\nRESEARCH CONTEXT for ${cli.company}:\n${JSON.stringify(prof)}\nRound: ${rn}/6`;

            const resp = await gem(
                `Role: Expert Proposal Specialist & Data Analyst.
The client uploaded a requirement document "${f.name}".

FILE CONTENTS:
${fileContent.slice(0, 15000)}

INSTRUCTIONS:
1. Acknowledge the file upload warmly and use the "Expert Proposal Specialist" protocol.
2. Provide a detailed textural summary of all gathered requirements in 3-4 professional paragraphs.
3. If the document is comprehensive enough (covers pain points, departments, requirements), output REQUIREMENTS_COMPLETE followed by the full JSON block.
4. If more info is needed, ask ONE focused follow-up question.

CRITICAL: Extract ALL requirements found and map them to Zoho products.`,
                2000, 0.5, true, convo, sys
            );
            removeTypingIndicator();
            hideLdr();

            if (!resp) return;
            const potentialJson = safeJ(resp);
            if (resp.includes('REQUIREMENTS_COMPLETE')) {
                const parts = resp.split('REQUIREMENTS_COMPLETE');
                if (parts[0].trim()) addAg(parts[0].trim());
                reqs = safeJ(parts[1]) || { summary: fileContent.slice(0, 200), must_have: ['Zoho Implementation'] };
                discoveryComplete = true;
                showReqSummary();
            } else if (potentialJson && (potentialJson.must_have || potentialJson.pain_points)) {
                reqs = potentialJson;
                discoveryComplete = true;
                showReqSummary();
            } else {
                addAg(resp);
                convo.push({ role: 'assistant', content: resp });
            }
        } else if (f.type.startsWith('image/')) {
            fileContent = `[File: ${f.name} — ${f.type}. No text extracted.]`;
            const ackMsg = `I uploaded an image: ${f.name}. Please acknowledge and ask about its requirements.`;
            convo.push({ role: 'user', content: ackMsg });
            saveFileToMemory(activeClientId, { name: f.name, type: f.type, size: f.size }, fileContent);
            hideLdr();
            showTypingIndicator();
            const ackResp = await gem(ackMsg, 500, 0.5, false, convo, ZK);
            removeTypingIndicator();
            if (ackResp) {
                addAg(ackResp);
                convo.push({ role: 'assistant', content: ackResp });
            }
        } else {
            addAg(`Unsupported file type: ${f.name}. Please provide a PDF, DOCX, or text file.`);
            hideLdr();
        }
    } catch (err) {
        console.error('[Document Analysis Error]', err);
        removeTypingIndicator();
        hideLdr();
        const errDetails = err.message || (err.data && err.data.detail) || "Unknown Error";
        if (errDetails.includes('429')) {
             addAg(`I hit a rate limit while analyzing <strong>${f.name}</strong>. Please wait a minute and try again.`, { noEscape: true });
        } else {
             addAg(`<strong>CRITICAL ERROR: Unable to read attachment. Please ensure 'File Search' is enabled in the agent settings or paste the text directly.</strong>`, { noEscape: true });
        }
    }
    e.target.value = '';
};

function readBase64(f) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(f);
    });
}
function readArrayBuffer(f) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsArrayBuffer(f);
    });
}
function readText(f) {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = ev => res(ev.target.result);
        r.onerror = rej;
        r.readAsText(f);
    });
}

/* ── Send message ── */
document.getElementById('sendBtn').addEventListener('click', async () => {
    const inp = document.getElementById('msgIn');
    const msg = inp.value.trim();
    if (!msg) return;

    // Stop agent talking and clear queue if user sends a message
    voiceQueue = [];
    if (currentAudioSource) {
        try { currentAudioSource.stop(); } catch(e){}
        currentAudioSource = null;
    }

    if (discoveryComplete) discoveryComplete = false;
    addUs(msg);
    convo.push({ role: 'user', content: msg });
    inp.value = '';
    rn++;
    updateCov(Math.min(95, 10 + rn * 8.5));
    showTypingIndicator();
    try {
        const resp = await nextQ();
        removeTypingIndicator();
        if (!resp) return; 
        const potentialJson = safeJ(resp);
        if (resp.includes('REQUIREMENTS_COMPLETE')) {
            const parts = resp.split('REQUIREMENTS_COMPLETE');
            if (parts[0].trim()) addAg(parts[0].trim());
            reqs = safeJ(parts[1]) || { summary: 'Requirement analysis complete', must_have: ['Zoho Consultation'] };
            discoveryComplete = true;
            showReqSummary();
        } else if (potentialJson && (potentialJson.must_have || potentialJson.pain_points)) {
            // Handle cases where the AI forced JSON output and omitted the keyword
            reqs = potentialJson;
            discoveryComplete = true;
            showReqSummary();
        } else if (resp.includes('INITIATE_PROPOSAL_BUILD')) {
            const cleanResp = resp.replace('INITIATE_PROPOSAL_BUILD', '').trim();
            if (cleanResp) {
                addAg(cleanResp);
                convo.push({ role: 'assistant', content: cleanResp });
            }
            discoveryComplete = true;
            // Small delay to let the AI voice finish speaking most of the confirmation
            setTimeout(() => {
                buildSolution();
            }, 2500);
        } else {
            addAg(resp);
            convo.push({ role: 'assistant', content: resp });
        }
    } catch (e) {
        removeTypingIndicator();
        console.error('[nextQ error]', e);
        if (rn >= 10) {
            discoveryComplete = true;
            // Less rigid fallback
            reqs = { summary: 'Discovery session concluded.', must_have: ['Project Requirements Gathering', 'Module Configuration'] };
            showReqSummary();
        } else {
            // Round-specific fallbacks
            const fallbacks = {
                1: `Thanks for sharing that! Just to understand the scale — roughly how many people would be using this system, and which departments would it cover?`,
                2: `Got it! What's the single biggest bottleneck this is causing your team right now — is it manual work, missed follow-ups, or lack of visibility?`,
                3: `Walk me through a typical day. How do you currently handle a new lead or customer inquiry from start to finish?`,
                4: `To make this truly seamless, what other tools do you use? Do we need to sync with your website, WhatsApp, or perhaps an accounting tool like Tally?`,
                5: `Do you have existing records in Excel or another software that we'd need to migrate into the new Zoho environment?`,
                6: `When it comes to evaluating and approving this project — who all from your team would be part of the final decision-making process?`,
                7: `Is there a specific date or business milestone you're aiming for to have this system live?`,
                8: `If we meet in 6 months and this project is a huge success — what exactly has changed? What's the one metric you'd be most proud to show?`,
                9: `If you had to pick the top 3 absolute non-negotiable 'Must-Have' features for this system, what would they be?`,
                10: `How comfortable is your team with new technology? Would you prefer a hands-on training series, or is a simple documentation guide enough?`,
            };
            addAg(fallbacks[rn] || `Thanks for that detail! What else should I know about your requirements — any specific integrations or systems you'd need to connect with?`);
        }
    }
});

function showTypingIndicator() {
    const f = document.getElementById('feed');
    const existing = f.querySelector('.typing-indicator');
    if (existing) return;
    const d = document.createElement('div');
    d.className = 'typing-indicator';
    d.innerHTML = `<div class="msg-av">F</div><div class="typing-dots"><span></span><span></span><span></span></div>`;
    f.appendChild(d);
    f.scrollTop = f.scrollHeight;
}

function removeTypingIndicator() {
    const f = document.getElementById('feed');
    const ti = f.querySelector('.typing-indicator');
    if (ti) {
        gsap.to(ti, { opacity: 0, y: -8, duration: 0.2, onComplete: () => ti.remove() });
    }
}

document.getElementById('msgIn').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('sendBtn').click();
});

/* ══ DEEPGRAM VOICE INTEGRATION ══ */
(function initDeepgramMic() {
    const micBtn = document.getElementById('micBtn');
    if (!micBtn) return;
    
    let socket = null;
    let mediaRecorder = null;
    let listening = false;
    let callingMode = true; // Enabled by default for "Calling Agent" experience

    const callBtn = document.getElementById('callToggleBtn');
    if (callBtn) {
        // Init state
        if (callingMode) callBtn.classList.add('call-active');
        
        // New structure for callBtn and exitBtn
        document.getElementById('callToggleBtn').onclick = async () => {
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();
            
            callingMode = !callingMode;
            await toggleCallingMode(); // Shared logic
        };

        const exitBtn = document.getElementById('exitCallBtn');
        if (exitBtn) {
            exitBtn.onclick = async () => {
                if (callingMode) {
                    callingMode = false;
                    await toggleCallingMode();
                }
            };
        }

        async function toggleCallingMode() {
            const btn = document.getElementById('callToggleBtn');
            btn.classList.toggle('call-active', callingMode); // Use call-active class
            document.body.classList.toggle('focus-mode-active', callingMode);
            
            const panel = document.querySelector('.chat-panel');
            panel.classList.toggle('calling-mode-active', callingMode);
            
            const statusEl = document.getElementById('callStatus');
            if (statusEl) statusEl.classList.toggle('hidden', !callingMode);

            if (callingMode) {
                console.log('[Focus Mode] ACTIVE');
                showToast('Calling Mode: ON (Hands-free)', 'success');
                
                // If empty conversation, start it!
                if (convo.length === 0) {
                    addUs("Start the discovery.");
                    convo.push({ role: 'user', content: "Please introduce yourself and start the discovery session." });
                    const resp = await gem(ZK + "\n\nUser is ready. Start Phase 1.", 1000, 0.7, false, convo);
                    convo.push({ role: 'assistant', content: resp });
                    addAg(resp);
                } else {
                    // Context-aware re-entry for "Trained" feel
                    const progressNudge = `[SYSTEM: User has switched to VOICE/CALL mode. Current Progress: ${rn}/10. Current Client: ${cli?.company || 'Unknown'}. ${fileContent ? 'A document is uploaded.' : ''} Welcome them back to the voice discovery and continue from where we left off naturally.]`;
                    const resp = await gem(ZK + "\n\n" + progressNudge, 1000, 0.7, false, convo);
                    convo.push({ role: 'assistant', content: resp });
                    addAg(resp);
                }
            } else {
                if (statusEl) statusEl.classList.add('hidden');
                if (panel) panel.classList.remove('calling-mode-active');
                document.body.classList.remove('focus-mode-active');
                
                // Stop voice if they quit
                voiceQueue = [];
                if (currentAudioSource) {
                    try { currentAudioSource.stop(); } catch(e){}
                    currentAudioSource = null;
                }
                showToast('Calling Mode: OFF (Manual)', 'success');
            }
        };
    }

    // Keyboard shortcut to exit Focus Mode
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && callingMode) {
            const btn = document.getElementById('callToggleBtn');
            if (btn) btn.click();
        }
    });

    async function startRecording() {
        // Step 0: Ensure AudioContext is resumed (browser requirement)
        if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        // Step 1: Get mic access
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.error('[Mic Permission]', err);
            showToast('Microphone access denied — please allow mic permissions in your browser.', 'error');
            listening = false;
            return;
        }

        // Step 2: Get Deepgram key (try backend first, fallback to env, then hardcoded)
        let key;
        try {
            showToast('Connecting to voice service…', 'success');
            const dgData = await voice.getKey();
            key = dgData.key;
            if (!key || key === 'mock-key') throw new Error('No valid key from backend');
        } catch (err) {
            // Fallback 1: Vite env var
            key = import.meta.env.VITE_DEEPGRAM_KEY || null;
            
            // Fallback 2: Hardcoded static key (guaranteed to work if others fail)
            if (!key) {
                key = '6e712ff0167128210a0dae3fc2fcda370858fc7e';
                console.log('[Voice] Using hardcoded fallback key');
            } else {
                console.log('[Voice] Using embedded Deepgram key from build env');
            }
        }

        // Step 3: Connect to Deepgram WebSocket
        try {
            socket = new WebSocket(
                'wss://api.deepgram.com/v1/listen?interim_results=true&punctuate=true&language=en-IN',
                ['token', key]
            );

            socket.onopen = () => {
                micBtn.classList.add('mic-listening');
                const waves = document.querySelectorAll('.voice-wave, .large-voice-wave');
                waves.forEach(w => w.classList.add('active'));
                document.getElementById('msgIn').placeholder = 'Listening…';

                const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                    ? 'audio/webm;codecs=opus'
                    : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : '';

                mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
                mediaRecorder.addEventListener('dataavailable', async (event) => {
                    if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                        socket.send(event.data);
                    }
                });
                mediaRecorder.start(250);
            };

            socket.onmessage = (message) => {
                const received = JSON.parse(message.data);
                const transcript = received.channel.alternatives[0].transcript;
                if (transcript && received.is_final) {
                    document.getElementById('msgIn').value += transcript + ' ';
                } else if (transcript) {
                    document.getElementById('msgIn').placeholder = transcript + '...';
                }
            };

            socket.onclose = () => {
                stream.getTracks().forEach(t => t.stop());
                stopRecording();
            };

            socket.onerror = (err) => {
                console.error('[Deepgram Socket Error]', err);
                stream.getTracks().forEach(t => t.stop());
                showToast('Deepgram connection failed — check API key or try again.', 'error');
                stopRecording();
            };

        } catch (err) {
            console.error('[WebSocket Error]', err);
            stream.getTracks().forEach(t => t.stop());
            showToast('Could not connect to Deepgram voice service.', 'error');
            listening = false;
        }
    }

    function stopRecording() {
        listening = false;
        micBtn.classList.remove('mic-listening');
        const waves = document.querySelectorAll('.voice-wave, .large-voice-wave');
        waves.forEach(w => w.classList.remove('active'));
        document.getElementById('msgIn').placeholder = 'Type your response…';
        if (mediaRecorder) mediaRecorder.stop();
        if (socket) socket.close();
        
        // Auto-send if there's any content and callingMode is ON
        const val = document.getElementById('msgIn').value.trim();
        if (callingMode && val.length > 0) {
            setTimeout(() => {
                if (document.getElementById('msgIn').value.trim() === val) {
                   document.getElementById('sendBtn').click();
                }
            }, 1500);
        }
    }

    micBtn.addEventListener('click', () => {
        // Stop agent talking and clear queue if user takes the mic
        voiceQueue = [];
        if (currentAudioSource) {
            try { currentAudioSource.stop(); } catch(e){}
            currentAudioSource = null;
        }
        if (discoveryComplete) return;
        if (listening) {
            stopRecording();
        } else {
            listening = true;
            document.getElementById('msgIn').value = '';
            startRecording();
        }
    });
})();

/* ══ CONVERSATION MEMORY ══ */
function saveConversationMemory() {
    if (!activeClientId) return;
    localStorage.setItem(`session_${activeClientId}`, JSON.stringify({
        convo, reqs, sol, prof, rn, fileContent: fileContent.slice(0, 4000), discoveryComplete, ts: Date.now()
    }));
}

function loadConversationMemory(clientId) {
    const saved = localStorage.getItem(`session_${clientId}`);
    if (!saved) return false;
    try {
        const m = JSON.parse(saved);
        if (Date.now() - m.ts > 7 * 86400000) return false;
        ({ convo, reqs, sol, prof, rn, fileContent, discoveryComplete } = {
            convo: m.convo || [], reqs: m.reqs || null, sol: m.sol || null,
            prof: m.prof || null, rn: m.rn || 0,
            fileContent: m.fileContent || '', discoveryComplete: m.discoveryComplete || false
        });
        return true;
    } catch { return false; }
}

function saveFileToMemory(clientId, meta, content) {
    const key = `files_${clientId}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = existing.findIndex(f => f.name === meta.name);
    const entry = { ...meta, content: content.slice(0, 5000), ts: Date.now() };
    if (idx >= 0) existing[idx] = entry; else existing.push(entry);
    localStorage.setItem(key, JSON.stringify(existing));
}

function renderClientFiles(clientId) {
    const container = document.getElementById('clientFilesSection');
    if (!container) return;
    const files = JSON.parse(localStorage.getItem(`files_${clientId}`) || '[]');
    if (!files.length) { container.style.display = 'none'; return; }
    container.style.display = 'block';
    document.getElementById('filesList').innerHTML = files.map(f => `
        <div class="file-row">
            <div class="file-icon">${f.type?.startsWith('image/') ? '<svg viewBox="0 0 20 20" width="20" height="20" fill="none"><rect x="2" y="3" width="16" height="14" rx="2" stroke="var(--sub)" stroke-width="1.5"/><path d="M4 14l3-3 2 2 4-5 3 3" stroke="var(--sub)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : f.type === 'application/pdf' ? '<svg viewBox="0 0 20 20" width="20" height="20" fill="none"><rect x="4" y="2" width="12" height="16" rx="2" stroke="var(--red)" stroke-width="1.5"/><path d="M8 7h4M8 10h4M8 13h2" stroke="var(--red)" stroke-width="1.3" stroke-linecap="round"/></svg>' : '<svg viewBox="0 0 20 20" width="20" height="20" fill="none"><path d="M3 5h5l2 2h7v10H3V5z" stroke="var(--sub)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'}</div>
            <div><div class="file-name">${f.name}</div><div class="file-meta">${(f.size/1024).toFixed(1)}KB · ${new Date(f.ts).toLocaleString()}</div></div>
        </div>`).join('');
}

/* ══ REQUIREMENTS SUMMARY ══ */
function showReqSummary() {
    if (!reqs) reqs = { summary: 'Ready to proceed.', must_have: [] };
    setStg(2, 'done'); setStg(3, 'act'); setPhase('Reviewing Requirements…');
    saveConversationMemory();

    const makeChips = (arr) => (arr || []).map(t => `<span class="reqs-chip">${t}</span>`).join('');
    const makeList  = (arr) => (arr || []).map(i => `<li>${i}</li>`).join('');

    const products = reqs.zoho_products || [];
    const productChips = products.length ? products.map(p => `<span style="background:rgba(26,79,214,.08);color:#1A4FD6;border:1px solid rgba(26,79,214,.2);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M4 8l3 3 5-5" stroke="#1A4FD6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>${p}</span>`).join(' ') : '';

    const html = `
    <div class="reqcard-full">
      <div class="reqcard-intro">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--green),#34d399);display:flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 8l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <strong style="font-size:15px;color:var(--text)">Discovery Complete</strong>
        </div>
        Here's a complete summary of everything we've captured. Please review carefully — if this accurately reflects your requirements, confirm and I'll generate your formal proposal.
      </div>
      <div class="reqcard-box">
        <div class="reqcard-title" style="display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="4" y="3" width="12" height="15" rx="2" stroke="#fff" stroke-width="1.5"/><path d="M8 7h4M8 10h4M8 13h2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
          Requirements Summary — ${cli?.company || ''}
        </div>
        ${reqs.business_overview ? `<div class="reqs-section"><div class="reqs-label">Business Overview</div><div class="reqs-text">${reqs.business_overview}</div></div>` : ''}
        ${reqs.industry ? `<div class="reqs-section" style="display:flex;gap:24px;flex-wrap:wrap"><div><div class="reqs-label">Industry</div><div style="font-size:13px;font-weight:600;color:var(--text)">${reqs.industry}</div></div>${reqs.user_count ? `<div><div class="reqs-label">Users</div><div style="font-size:13px;font-weight:600;color:var(--text)">${reqs.user_count}</div></div>` : ''}${reqs.timeline ? `<div><div class="reqs-label">Timeline</div><div style="font-size:13px;font-weight:600;color:var(--text)">${reqs.timeline}</div></div>` : ''}</div>` : ''}
        ${(reqs.departments||[]).length ? `<div class="reqs-section"><div class="reqs-label">Departments / Teams</div><div class="reqs-chips">${makeChips(reqs.departments)}</div></div>` : ''}
        ${(reqs.current_tools||[]).length ? `<div class="reqs-section"><div class="reqs-label">Current Tools</div><div class="reqs-chips">${makeChips(reqs.current_tools)}</div></div>` : ''}
        ${(reqs.pain_points||[]).length ? `<div class="reqs-section"><div class="reqs-label">Pain Points</div><ul class="reqs-list">${makeList(reqs.pain_points)}</ul></div>` : ''}
        ${(reqs.must_have||[]).length ? `<div class="reqs-section"><div class="reqs-label">Must-Have Requirements</div><ul class="reqs-list">${makeList(reqs.must_have)}</ul></div>` : ''}
        ${(reqs.nice_to_have||[]).length ? `<div class="reqs-section"><div class="reqs-label">Nice to Have</div><ul class="reqs-list">${makeList(reqs.nice_to_have)}</ul></div>` : ''}
        ${(reqs.automation_opportunities||[]).length ? `<div class="reqs-section"><div class="reqs-label">Automation Opportunities</div><ul class="reqs-list">${makeList(reqs.automation_opportunities)}</ul></div>` : ''}
        ${(reqs.integrations||[]).length ? `<div class="reqs-section"><div class="reqs-label">Integration Requirements</div><ul class="reqs-list">${makeList(reqs.integrations)}</ul></div>` : ''}
        ${(reqs.success_metrics||[]).length ? `<div class="reqs-section"><div class="reqs-label">Success Metrics</div><ul class="reqs-list">${makeList(reqs.success_metrics)}</ul></div>` : ''}
        ${productChips ? `<div class="reqs-section"><div class="reqs-label">Recommended Zoho Products</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">${productChips}</div></div>` : ''}
        <div class="reqs-actions" style="display:flex;flex-wrap:wrap;gap:10px;padding:16px 18px;background:var(--bg);border-top:1px solid var(--brd)">
          <button class="reqs-btn-confirm" id="confirmProposal" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;font-size:13px;border-radius:10px">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M4 8l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Create Proposal
          </button>
          <button class="reqs-btn-clarify" id="summaryBtn" style="display:flex;align-items:center;gap:6px;padding:12px 16px;border-radius:10px;background:#f3f4f6;color:#374151">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M3 3h10v10H3V3z" stroke="currentColor" stroke-width="1.5"/><path d="M6 6h4M6 8h4M6 10h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            Summary
          </button>
          <button class="reqs-btn-clarify" id="clarifyBtn" style="display:flex;align-items:center;gap:6px;padding:12px 16px;border-radius:10px">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M11.5 1.5l3 3L5 14H2v-3z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Changes Required
          </button>
          <button class="reqs-btn-wrong" id="wrongBtn" style="display:flex;align-items:center;gap:6px;padding:12px 16px;border-radius:10px">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            Not Right
          </button>
        </div>
      </div>
    </div>`;

    addAg(html, { noEscape: true });
    setTimeout(() => {
        document.getElementById('confirmProposal')?.addEventListener('click', buildSolution);
        document.getElementById('summaryBtn')?.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('generateBRD'));
        });
        document.getElementById('clarifyBtn')?.addEventListener('click', () => {
            discoveryComplete = false;
            addAg("Of course! What changes would you like? I'll update the requirements accordingly.");
            document.getElementById('msgIn').focus();
        });
        document.getElementById('wrongBtn')?.addEventListener('click', () => {
            discoveryComplete = false; reqs = null;
            addAg("No problem at all — let's start fresh. What didn't look right? I want to make sure we capture your needs accurately.");
            document.getElementById('msgIn').focus();
        });
    }, 100);
}

async function buildSolution() {
    setStg(3, 'done'); setStg(4, 'act'); setPhase('Architecting Custom Proposal…');
    const steps = [
        { pct: 15, txt: 'Analysing client-specific pain points…' },
        { pct: 35, txt: 'Drafting uniquely tailored solution architecture…' },
        { pct: 60, txt: 'Applying "Anti-Static" rewrite rules…' },
        { pct: 85, txt: 'Finalizing Proposal Specialist draft…' },
    ];
    try {
        for (const s of steps) { showLdr(s.txt, s.pct); await sleep(600 + Math.random() * 300); }
        
        // We now ask the AI to generate the ENTIRE content for the proposal sections
        const systemPrompt = `${PROPOSAL_SPECIALIST_PROMPT}\n\nCLIENT CONTEXT: ${JSON.stringify(reqs)}`;
        const userPrompt = `Generate a PROFESSIONAL TECHNICAL ZOHO PROPOSAL following the Expert Proposal Specialist Protocol. 
RETURN ONLY RAW JSON. NO MARKDOWN. 
SCHEMA: {
    "extraction_proof": {
        "client_name": "...",
        "project_goals": "...",
        "technical_requirements": ["Requirement 1", "Requirement 2", "Requirement 3"]
    },
    "title": "Clear catch technical title",
    "executive_summary": "Extremely detailed 4-5 paragraph executive summary (Min 3 paragraphs) addressing specific pain points.",
    "core_requirements": ["10-12 granular requirements"],
    "solution_architecture": [
        {"phase": "1", "name": "...", "objective": "Detailed implementation objective (Min 2 paragraphs of context expected in rendering)"}
    ],
    "detailed_scope": [
        {"module": "Technical Module Name", "capabilities": ["8-10 specific technical capabilities"], "persona": "Stakeholders"}
    ],
    "integrations": [
        {"name": "...", "benefit": "...", "method": "Technical Method Detail"}
    ],
    "commercial_phases": [
        {"name": "Discovery", "amount": "₹ (Quoted)", "model": "T&M"}
    ],
    "zoho_data_sync": {
        "lead_name": "...",
        "estimated_value": "₹ (Quoted)",
        "timeline": "Phase-wise timeline summary"
    }
}`;
        const res = await gem(userPrompt, 3000, 0.6, true, [], systemPrompt);
        sol = safeJ(res);
        if (!sol) throw new Error('Bad JSON from AI');
        hideLdr(); setStg(4, 'done');
        generateProposal();
    } catch (e) {
        console.error('[buildSolution error]', e);
        // Fallback with same structure
        sol = {
            title: `Zoho CRM Plus Implementation for ${cli.company}`,
            executive_summary: `Your need for streamlined operations at ${cli.company} requires a tailored approach. We've architected a solution that directly addresses your core bottlenecks.`,
            core_requirements: reqs.must_have || ['Zoho Configuration'],
            solution_architecture: [{ phase: '1', name: 'Intake', objective: 'Standardize incoming data' }],
            detailed_scope: [{ module: 'CRM Core', capabilities: ['Workflow automation'], persona: 'Admin' }],
            integrations: [{ name: 'Email', benefit: 'Direct sync', method: 'Native' }],
            commercial_phases: [{ name: 'Implementation', amount: '₹ (Quoted)', model: 'Fixed' }]
        };
        hideLdr(); setStg(4, 'done');
        generateProposal();
    }
}

async function generateProposal() {
    showLdr('Generating CCMS proposal…');
    const fname   = `Zoho_CCMS_Proposal_${(cli.company||'Client').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.html`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const products   = ['Zoho CRM Plus', 'Zoho Desk', 'Zoho Survey', 'Zoho Analytics'];
    const industry   = reqs?.industry || cli.industry || 'Manufacturing';
    const workflows  = sol?.workflow || sol?.workflows || [];

    const wfRows     = workflows.map(w => `<tr><td style="font-weight:700;color:#1A4FD6;text-align:center;width:40px">${w.step}</td><td style="font-weight:600">${w.name}</td><td style="color:#4F6282">${w.description}</td></tr>`).join('');

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Zoho Proposal — ${cli.company}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
<style>
:root{--primary:#3B82F6;--navy:#0F172A;--slate:#475569;--bg:#F8FAFC;--white:#FFFFFF;--brd:#E2E8F0}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:var(--navy);line-height:1.6;background:#F1F5F9;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.page{max-width:960px;margin:20px auto;background:var(--white);box-shadow:0 20px 50px rgba(15,23,42,0.1);position:relative;overflow:hidden;border-radius:12px}
.cover{height:1000px;display:flex;flex-direction:column;justify-content:center;padding:80px;background:radial-gradient(circle at 100% 0%, rgba(59,130,246,0.05) 0%, transparent 40%), radial-gradient(circle at 0% 100%, rgba(59,130,246,0.05) 0%, transparent 40%);position:relative}
.cover::after{content:'';position:absolute;bottom:0;left:0;width:100%;height:8px;background:linear-gradient(90deg,var(--primary),#1D4ED8)}
.cover-logo{display:flex;align-items:center;gap:12px;margin-bottom:60px}
.cover-logo-box{width:48px;height:48px;background:var(--navy);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:22px;box-shadow:0 10px 20px rgba(15,23,42,0.2)}
.cover-logo-name{font-family:'DM Sans',sans-serif;font-weight:700;font-size:18px;color:var(--navy);letter-spacing:-0.5px}
.cover-tag{font-size:12px;font-weight:600;color:var(--primary);text-transform:uppercase;letter-spacing:2px;margin-bottom:12px}
h1{font-family:'DM Sans',sans-serif;font-size:48px;font-weight:700;color:var(--navy);line-height:1.1;letter-spacing:-1.5px;margin-bottom:20px}
.client-name{font-size:28px;font-weight:500;color:var(--slate);margin-bottom:40px}
.meta-card{background:#F8FAFC;border:1px solid var(--brd);border-radius:16px;padding:32px;display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:100%}
.meta-item label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--slate);display:block;margin-bottom:4px}
.meta-item span{font-size:15px;font-weight:600;color:var(--navy)}
.section{padding:80px 80px 40px;position:relative;page-break-before:always}
.sec-head{display:flex;align-items:flex-end;gap:16px;margin-bottom:40px;border-bottom:2px solid #F1F5F9;padding-bottom:12px}
.sec-num{font-family:'DM Sans',sans-serif;font-size:60px;font-weight:700;color:#F1F5F9;line-height:0.8;position:absolute;left:30px;top:65px;z-index:0}
.sec-title{font-family:'DM Sans',sans-serif;font-size:24px;font-weight:700;color:var(--navy);position:relative;z-index:1;letter-spacing:-0.5px}
.sec-title span{color:var(--primary)}
p{font-size:15px;color:var(--slate);line-height:1.8;margin-bottom:20px}
.about-box{background:var(--navy);border-radius:20px;padding:40px;margin-bottom:32px;box-shadow:0 15px 30px rgba(15,23,42,0.15)}
.about-box p{color:rgba(255,255,255,0.7);margin-bottom:0;font-size:16px}
.clients-grid{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.client-tag{background:rgba(59,130,246,0.06);color:var(--primary);font-size:12px;font-weight:600;padding:6px 16px;border-radius:30px;border:1px solid rgba(59,130,246,0.15)}
table{width:100%;border-collapse:separate;border-spacing:0;font-size:14px;margin-bottom:32px;border:1px solid var(--brd);border-radius:12px;overflow:hidden}
th{background:#F8FAFC;padding:16px;text-align:left;font-size:11px;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--brd)}
td{padding:16px;border-bottom:1px solid var(--brd);vertical-align:top;background:white}
tr:last-child td{border-bottom:none}
ul.bullets{padding-left:24px;margin-bottom:32px}
ul.bullets li{font-size:15px;color:var(--slate);margin-bottom:12px;position:relative}
.badge{padding:4px 12px;border-radius:30px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
.badge-config{background:rgba(59,130,246,0.1);color:var(--primary)}
.badge-tm{background:rgba(245,158,11,0.1);color:#F59E0B}
.acceptance-grid{display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:40px}
.sign-box{border:1px solid var(--brd);border-radius:16px;padding:32px}
.sign-label{font-weight:700;font-size:14px;color:var(--navy);margin-bottom:24px;display:block}
.sign-line{border-bottom:1px solid var(--brd);margin-bottom:20px;height:40px}
.sign-meta{font-size:12px;color:var(--slate);margin-bottom:4px}
.footer{padding:40px 80px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--brd);background:#F8FAFC}
.footer-text{font-size:12px;color:var(--slate);font-weight:500}
.price-tag{color:var(--primary);font-weight:700;font-family:'DM Sans',sans-serif}
@media print{.page{margin:0;box-shadow:none;border-radius:0}.no-print{display:none}}
</style></head><body>
<div class="page">
<div class="cover">
  <div class="cover-logo"><div class="cover-logo-box">F</div><div class="cover-logo-name">FRISTINE INFOTECH</div></div>
  <div class="cover-tag">Implementation Proposal</div>
  <h1>Zoho CRM Plus for CCMS Lifecycle</h1>
  <div class="client-name">Prepared for ${cli.company || 'Client'}</div>
  <div class="meta-card">
    <div class="meta-item"><label>Date / Version</label><span>${dateStr} / v1.2</span></div>
    <div class="meta-item"><label>Project Reference</label><span>PRJ-CCMS-${cli.company?.substring(0,3).toUpperCase() || 'XXX'}</span></div>
    <div class="meta-item"><label>Solution Architect</label><span>Fristine Presales Team</span></div>
    <div class="meta-item"><label>Contact</label><span>presales@fristinetech.com</span></div>
  </div>
</div>

<!-- Page 1: Extraction Proof (Rule #2) -->
<div class="page" style="padding:40px 80px">
    <div class="section" style="padding:40px 0">
        <div class="sec-num">00</div>
        <div class="sec-head"><div class="sec-title">Extraction <span>Proof</span></div></div>
        <p style="margin-bottom:20px;color:var(--slate)"><em>Requirement document analysis for <strong>${sol.extraction_proof?.client_name || cli.company}</strong>:</em></p>
        <div style="background:var(--bg);padding:32px;border-radius:16px;border:1px solid var(--brd)">
            <p style="font-weight:700;margin-bottom:8px;color:var(--navy)">Primary Project Goals:</p>
            <p style="margin-bottom:20px;color:var(--slate)">${sol.extraction_proof?.project_goals || 'See requirements below.'}</p>
            <p style="font-weight:700;margin-bottom:8px;color:var(--navy)">Identified Technical Requirements:</p>
            <ul class="bullets" style="margin-bottom:0">
                ${(sol.extraction_proof?.technical_requirements || []).map(r => `<li>${r}</li>`).join('')}
            </ul>
        </div>
    </div>
</div>

<div class="section">
  <div class="sec-num">01</div>
  <div class="sec-head"><div class="sec-title">The <span>Fristine</span> Advantage</div></div>
  <div class="about-box"><p>Fristine Infotech is India's premier Zoho Partner, recognized as the "Innovator of the Year". We specialize in transforming complex legacy workflows into streamline digital ecosystems using Zoho's unified stack.</p></div>
  <p>With a decade of experience and over <strong>200 successful enterprise implementations</strong>, we bring a wealth of domain expertise in manufacturing, operations, and quality management.</p>
  <div class="clients-grid">${['eBay','Pepperfry','Edelweiss','Jio','Suzlon','Mercedes-Benz','TATA MD','CARE Ratings','CRISIL','NPCI'].map(c=>`<span class="client-tag">${c}</span>`).join('')}</div>
</div>

<div class="section">
  <div class="sec-num">02</div>
  <div class="sec-head"><div class="sec-title">Executive <span>Summary</span></div></div>
  <div class="executive-content">${sol.executive_summary?.replace(/\n/g, '<br/>') || ''}</div>
  <p><strong>Key Requirements Captured:</strong></p>
  <ul class="bullets">
    ${(sol.core_requirements || []).map(r => `<li>${r}</li>`).join('')}
  </ul>
</div>

<div class="section">
  <div class="sec-num">03</div>
  <div class="sec-head"><div class="sec-title">Proposed <span>Architecture</span></div></div>
  <p>Our tailored approach for ${cli.company} follows a structured phased rollout to ensure maximum adoption and minimal disruption.</p>
  <table>
    <thead><tr><th style="width:60px;text-align:center">Phase</th><th>Implementation Stage</th><th>Primary Objectives</th></tr></thead>
    <tbody>
      ${(sol.solution_architecture || []).map(a => `<tr><td style="font-weight:800;color:var(--primary);text-align:center">${a.phase}</td><td style="font-weight:600;color:var(--navy)">${a.name}</td><td style="color:var(--slate)">${a.objective}</td></tr>`).join('')}
    </tbody>
  </table>
</div>

<div class="section">
  <div class="sec-num">04</div>
  <div class="sec-head"><div class="sec-title">Detailed <span>Scope Of Work</span></div></div>
  ${(sol.detailed_scope || []).map(s => `
    <p style="font-weight:700;color:var(--navy);font-size:14px;margin-bottom:12px">${s.module}</p>
    <table><thead><tr><th>Capability Mapping</th><th>Persona / Stakeholder</th></tr></thead><tbody>
      <tr><td><ul style="padding-left:14px">${(s.capabilities || []).map(c => `<li>${c}</li>`).join('')}</ul></td><td>${s.persona}</td></tr>
    </tbody></table>
  `).join('')}
  
  <p style="font-weight:700;color:var(--navy);font-size:14px;margin-top:20px;margin-bottom:12px">Ecosystem Integrations</p>
  <table><thead><tr><th>Connector</th><th>Business Benefit</th><th>Method</th></tr></thead><tbody>
    ${(sol.integrations || []).map(i => `<tr><td>${i.name}</td><td>${i.benefit}</td><td>${i.method}</td></tr>`).join('')}
  </tbody></table>
</div>

<div class="section">
  <div class="sec-num">05</div>
  <div class="sec-head"><div class="sec-title">Commercial <span>Investment</span></div></div>
  <p>Based on our "Anti-Static" evaluation, the following investment structure is optimized for your project scale.</p>
  <table><thead><tr><th>Phase</th><th>Activity Details</th><th>Model</th><th>Amount (INR)</th></tr></thead><tbody>
    ${(sol.commercial_phases || []).map(p => `<tr><td>${p.name}</td><td>Strategic Implementation Services</td><td><span class="badge ${p.model === 'T&M' ? 'badge-tm' : 'badge-config'}">${p.model}</span></td><td class="price-tag" contenteditable="true">${p.amount}</td></tr>`).join('')}
    <tr style="background:#F8FAFC"><td colspan="3" style="font-weight:700">Estimated Project Total</td><td class="price-tag" contenteditable="true">₹ (Quoted)</td></tr>
  </tbody></table>
</div>

<div class="section">
  <div class="sec-num">05</div>
  <div class="sec-head"><div class="sec-title">Commercial <span>Model</span></div></div>
  <p>The following estimates reflect the effort required for a standard "Platinum" CCMS Implementation on Zoho CRM Plus.</p>
  <table><thead><tr><th>Phase</th><th>Activity Description</th><th>Model</th><th>Amount (INR)</th></tr></thead><tbody>
    <tr><td>Phase 1</td><td>Requirement Discovery, FSD Drafting & Sign-off</td><td><span class="badge badge-tm">T&M</span></td><td class="price-tag" contenteditable="true">₹ (Quoted)</td></tr>
    <tr><td>Phase 2</td><td>CCMS Core Configuration & Workflow Automation</td><td><span class="badge badge-config">Fixed</span></td><td class="price-tag" contenteditable="true">₹ (Quoted)</td></tr>
    <tr><td>Phase 3</td><td>SAP S/4HANA & 3rd Party API Integrations</td><td><span class="badge badge-config">Fixed</span></td><td class="price-tag" contenteditable="true">₹ (Quoted)</td></tr>
    <tr><td>Phase 4</td><td>Migration, UAT, and Go-Live Hypercare</td><td><span class="badge badge-config">Fixed</span></td><td class="price-tag" contenteditable="true">₹ (Included)</td></tr>
    <tr style="background:#F8FAFC"><td colspan="3" style="font-weight:700">Estimated Project Total</td><td class="price-tag" contenteditable="true">₹ (Quoted)</td></tr>
  </tbody></table>
  
  <p style="font-weight:700;color:var(--navy);font-size:14px;margin-bottom:8px">Managed Services (Optional)</p>
  <p style="font-size:13px;margin-bottom:12px">80 Hours/Month support | SLA-driven response | L1, L2, L3 Support coverage.</p>
  <table style="width:50%"><tbody><tr style="background:var(--navy);color:#fff"><td style="font-weight:700">Monthly Support Fee</td><td class="price-tag" contenteditable="true" style="color:#FFF">₹ (Quoted)</td></tr></tbody></table>
</div>

<!-- Zoho CRM Data Sync (Rule #6) -->
<div class="section" style="margin-top:40px;padding-top:40px;border-top:4px solid var(--bg)">
  <div class="sec-head"><div class="sec-title">Zoho CRM <span>Data Sync</span></div></div>
  <p style="margin-bottom:16px">The following summary table is structured for direct synchronization with internal Zoho CRM lead management systems.</p>
  <table style="background:var(--white);border:2px solid var(--navy)">
    <thead style="background:var(--navy);color:white"><tr><th style="color:white">Lead Name</th><th style="color:white">Estimated Project Value</th><th style="color:white">Phase-wise Timeline</th></tr></thead>
    <tbody>
      <tr>
        <td style="font-weight:800;color:var(--navy)">${sol.zoho_data_sync?.lead_name || cli.company}</td>
        <td style="color:var(--primary);font-weight:800;font-size:16px">${sol.zoho_data_sync?.estimated_value || '₹ (Quoted)'}</td>
        <td style="color:var(--slate);font-weight:500">${sol.zoho_data_sync?.timeline || 'Implementation over 4-6 months'}</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="section">
  <div class="sec-num">06</div>
  <div class="sec-head"><div class="sec-title">Project <span>Acceptance</span></div></div>
  <div class="acceptance-grid">
    <div class="sign-box"><span class="sign-label">For Fristine Infotech Pvt Ltd</span><div class="sign-line"></div><div class="sign-meta">Signature & Stamp</div><div class="sign-line"></div><div class="sign-meta">Date</div></div>
    <div class="sign-box"><span class="sign-label">For ${cli.company || 'Client'}</span><div class="sign-line"></div><div class="sign-meta">Authorized Signatory</div><div class="sign-line"></div><div class="sign-meta">Date</div></div>
  </div>
</div>

<div class="footer">
  <div class="footer-text">Fristine Infotech · Zoho Premium Partner</div>
  <div class="footer-text">Confidential © ${new Date().getFullYear()}</div>
</div>
</div></body></html>`;

    if (activeClientId) {
        try { await proposals.save(activeClientId, html, `CCMS Proposal — ${cli.company||'Client'}`); } catch {}
        try { await tracking.logEvent(activeClientId, 'proposal_generated'); } catch {}
        try { await tracking.logEvent(activeClientId, 'proposal_submitted'); } catch {}
    }

    pendingBlob = new Blob([html], { type: 'text/html' });
    pendingName = fname;
    hideLdr();

    addAg(`
        <div class="reqcard-box" style="text-align:center;padding:28px 20px;">
            <div style="margin-bottom:14px"><svg viewBox="0 0 48 48" width="48" height="48" fill="none"><circle cx="24" cy="24" r="20" stroke="var(--green)" stroke-width="2.5"/><path d="M15 24l6 6 12-12" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div style="font-size:17px;font-weight:700;margin-bottom:10px">CCMS Proposal is Generated!</div>
            <div style="font-size:13px;color:var(--sub);line-height:1.75;max-width:400px;margin:0 auto">
                Your requirements have been successfully mapped to the CCMS Reference Architecture.<br/><br/>
                <strong>A Fristine presales specialist is reviewing your proposal and will share the detailed documents with you shortly.</strong>
            </div>
        </div>`, { noEscape: true });
}

/**
 * Properly converts a full HTML document string to PDF.
 * Handles <!DOCTYPE> documents by extracting styles and body content,
 * rendering inside a hidden iframe so styles apply correctly.
 */
async function exportHtmlToPdf(htmlString, filename) {
    return new Promise((resolve, reject) => {
        // Use a hidden iframe so the full HTML document renders with its own styles
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:960px;height:auto;border:none;';
        document.body.appendChild(iframe);

        iframe.onload = () => {
            // Wait a moment for fonts/styles to apply
            setTimeout(() => {
                const body = iframe.contentDocument.body;
                if (!body || !body.firstElementChild) {
                    document.body.removeChild(iframe);
                    reject(new Error('Empty document'));
                    return;
                }

                const opt = {
                    margin: 0,
                    filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, windowWidth: 960 },
                    jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' }
                };

                html2pdf().set(opt).from(body.firstElementChild).save().then(() => {
                    document.body.removeChild(iframe);
                    resolve();
                }).catch(err => {
                    document.body.removeChild(iframe);
                    reject(err);
                });
            }, 500);
        };

        iframe.srcdoc = htmlString;
    });
}

document.addEventListener('downloadClientProposal', async () => {
    if (!pendingBlob) return;
    const htmlText = await pendingBlob.text();
    showLdr('Exporting PDF…');
    try {
        await exportHtmlToPdf(htmlText, pendingName.replace('.html', '.pdf'));
    } catch (e) {
        console.error('[PDF]', e);
        showToast('PDF export failed', 'error');
    }
    hideLdr();
});

/* ── Client-side DOCX download ── */
document.addEventListener('downloadClientDocx', async () => {
    if (!pendingBlob || !cli) return;
    showLdr('Generating DOCX…');
    try {
        const htmlText = await pendingBlob.text();
        await generateDocx(htmlText, cli.company || 'Client');
        hideLdr();
        showToast('DOCX downloaded!', 'success');
    } catch (e) {
        hideLdr();
        showToast('DOCX export failed: ' + e.message, 'error');
    }
});

/* ══ BRD / FSD GENERATION ══ */
document.addEventListener('generateBRD', async () => {
    if (!reqs || !cli) return;
    showLdr('Generating Business Requirements Document…');
    try {
        const brdPrompt = `Generate a comprehensive Business Requirements Document (BRD) in clean HTML for ${cli.company}.

REQUIREMENTS DATA:
${JSON.stringify(reqs, null, 2)}

SOLUTION DATA:
${JSON.stringify(sol || {}, null, 2)}

Generate a professional BRD HTML document with these sections:
1. Executive Summary
2. Business Objectives
3. Project Scope (In-Scope / Out-of-Scope)
4. Stakeholders & Roles
5. Current State Analysis (current tools, pain points)
6. Business Requirements (numbered, with priority: Must-Have / Nice-to-Have)
7. Functional Requirements (grouped by department/module)
8. Non-Functional Requirements (performance, security, scalability)
9. Integration Requirements
10. Success Criteria & KPIs
11. Assumptions & Constraints
12. Approval & Sign-off

Use clean professional styling. Company: ${cli.company}, Industry: ${reqs.industry || cli.industry || '—'}.
Include Fristine Infotech branding (India's leading Premium Zoho Partner).
Return ONLY the complete HTML document, no markdown wrapping.`;

        const brdHtml = await gem(brdPrompt, 4000, 0.4, true);
        const cleanHtml = brdHtml.replace(/```html|```/g, '').trim();
        await exportHtmlToPdf(cleanHtml, `BRD_${(cli.company || 'Client').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
        hideLdr();
        showToast('BRD downloaded!', 'success');
    } catch (e) {
        hideLdr();
        showToast('BRD generation failed: ' + e.message, 'error');
    }
});

document.addEventListener('generateFSD', async () => {
    if (!reqs || !cli) return;
    showLdr('Generating Functional Specification Document…');
    try {
        const fsdPrompt = `Generate a comprehensive Functional Specification Document (FSD) in clean HTML for ${cli.company}.

REQUIREMENTS DATA:
${JSON.stringify(reqs, null, 2)}

SOLUTION DATA:
${JSON.stringify(sol || {}, null, 2)}

Generate a professional FSD HTML document with these sections:
1. Document Control (version, date, author: Fristine Infotech Presales)
2. Introduction & Purpose
3. System Overview & Architecture
4. Zoho Modules Configuration:
   - For each recommended product, detail: module setup, custom fields, layouts, workflows, automation rules
5. User Roles & Permissions Matrix
6. Data Model & Field Mappings
7. Business Process Workflows (step-by-step with triggers, conditions, actions)
8. Automation Rules & Workflow Definitions
9. Integration Specifications (APIs, data flow, sync frequency)
10. Data Migration Plan (source → target mapping, cleansing rules)
11. Reporting & Dashboard Specifications
12. UAT Test Scenarios (test case ID, steps, expected result)
13. Training Plan
14. Deployment & Go-Live Checklist

Products to configure: ${(reqs.zoho_products || sol?.primary_products || ['Zoho CRM']).join(', ')}
Company: ${cli.company}, Industry: ${reqs.industry || cli.industry || '—'}, Users: ${reqs.user_count || '—'}
Include Fristine Infotech branding.
Return ONLY the complete HTML document, no markdown wrapping.`;

        const fsdHtml = await gem(fsdPrompt, 4000, 0.4, true);
        const cleanHtml = fsdHtml.replace(/```html|```/g, '').trim();
        await exportHtmlToPdf(cleanHtml, `FSD_${(cli.company || 'Client').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
        hideLdr();
        showToast('FSD downloaded!', 'success');
    } catch (e) {
        hideLdr();
        showToast('FSD generation failed: ' + e.message, 'error');
    }
});

/* ══ DOCX GENERATION ══ */
async function generateDocx(proposalHtml, companyName) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(proposalHtml, 'text/html');

    const sections = doc.querySelectorAll('.section');
    const children = [];

    // Title page
    children.push(
        new Paragraph({ spacing: { after: 600 }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: 'FRISTINE INFOTECH', bold: true, size: 28, color: '1A4FD6', font: 'Calibri' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "India's Leading Premium Zoho Partner", italics: true, size: 20, color: '4F6282', font: 'Calibri' })],
        }),
        new Paragraph({ spacing: { after: 400 }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [new TextRun({ text: 'Zoho Implementation Proposal', bold: true, size: 36, color: '1A4FD6', font: 'Calibri' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: `For ${companyName}`, bold: true, size: 28, color: '1A2540', font: 'Calibri' })],
        }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
            children: [new TextRun({ text: `Prepared: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, size: 20, color: '7A91B3', font: 'Calibri' })],
        }),
        new Paragraph({ spacing: { after: 200 }, children: [] })
    );

    // Parse all text content from sections
    sections.forEach(section => {
        const titleEl = section.querySelector('.sec-title');
        if (titleEl) {
            children.push(new Paragraph({
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 400, after: 200 },
                children: [new TextRun({ text: titleEl.textContent, bold: true, size: 28, color: '1A4FD6', font: 'Calibri' })],
            }));
        }

        // Get all paragraphs
        section.querySelectorAll('p').forEach(p => {
            children.push(new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: p.textContent, size: 22, color: '4F6282', font: 'Calibri' })],
            }));
        });

        // Get all table data
        section.querySelectorAll('table').forEach(table => {
            const rows = [];
            table.querySelectorAll('tr').forEach(tr => {
                const cells = [];
                tr.querySelectorAll('th, td').forEach(cell => {
                    const isHeader = cell.tagName === 'TH';
                    cells.push(new TableCell({
                        width: { size: 100 / tr.children.length, type: WidthType.PERCENTAGE },
                        shading: isHeader ? { fill: '0B1120', type: ShadingType.SOLID, color: '0B1120' } : undefined,
                        children: [new Paragraph({
                            spacing: { after: 60 },
                            children: [new TextRun({
                                text: cell.textContent.trim(),
                                bold: isHeader,
                                size: isHeader ? 18 : 20,
                                color: isHeader ? 'FFFFFF' : '1A2540',
                                font: 'Calibri',
                            })],
                        })],
                    }));
                });
                if (cells.length > 0) {
                    rows.push(new TableRow({ children: cells }));
                }
            });
            if (rows.length > 0) {
                children.push(new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    rows,
                }));
                children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
            }
        });

        // Get lists
        section.querySelectorAll('li').forEach(li => {
            children.push(new Paragraph({
                bullet: { level: 0 },
                spacing: { after: 60 },
                children: [new TextRun({ text: li.textContent.trim(), size: 22, color: '4F6282', font: 'Calibri' })],
            }));
        });
    });

    // Footer
    children.push(
        new Paragraph({ spacing: { after: 400 }, children: [] }),
        new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `Confidential — Fristine Infotech Pvt Ltd — ${new Date().getFullYear()}`, size: 18, color: '7A91B3', font: 'Calibri' })],
        })
    );

    const docxDoc = new Document({
        sections: [{
            properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
            children,
        }],
    });

    const blob = await Packer.toBlob(docxDoc);
    saveAs(blob, `Proposal_${companyName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.docx`);
}

/* ══ MODALS ══ */
function openModal(id)  { document.getElementById(id).classList.add('visible'); }
function closeModal(id) { document.getElementById(id).classList.remove('visible'); }

document.getElementById('closeVideoBtn').addEventListener('click', () => { closeModal('videoModal'); generateProposal(); });
document.getElementById('playBtn')?.addEventListener('click', () => {
    const vpInner = document.querySelector('.vp-inner');
    if (vpInner && !vpInner.querySelector('video')) {
        vpInner.innerHTML = `<video width="100%" height="100%" controls autoplay style="border-radius:12px;background:#000;">
                                <source src="https://www.w3schools.com/html/mov_bbb.mp4" type="video/mp4">
                                Your browser does not support HTML video.
                             </video>`;
    }
});
document.getElementById('closeProposalBtn').addEventListener('click',  () => closeModal('proposalModal'));
document.getElementById('closeProposalBtn2')?.addEventListener('click', () => closeModal('proposalModal'));

document.getElementById('saveProposalEditsBtn')?.addEventListener('click', async () => {
    const cid  = currentTrackingClient?.client_id || activeClientId;
    if (!cid) return;
    const iframe = document.getElementById('proposalIframe');
    const updatedHtml = iframe.contentDocument.documentElement.outerHTML;
    const verId = document.getElementById('proposalModal').dataset.version;
    try {
        await proposals.update(cid, updatedHtml, verId ? parseInt(verId) : null);
        showToast(`Saved Version ${verId || 'Latest'}!`, 'success');
    } catch { showToast('Save failed', 'error'); }
});

document.getElementById('downloadProposalBtn')?.addEventListener('click', async () => {
    if (!currentTrackingClient) return;
    const btn = document.getElementById('downloadProposalBtn');
    const ogText = btn.textContent;
    btn.textContent = 'Exporting...';
    btn.disabled = true;
    try {
        const pData = await proposals.get(currentTrackingClient.client_id);
        const verId = document.getElementById('proposalModal').dataset.version;
        const pVer = verId ? pData.versions.find(x => x.version == parseInt(verId)) : pData.versions[pData.versions.length-1];
        if (!pVer || !pVer.proposal_html) throw new Error('No proposal');
        await exportHtmlToPdf(pVer.proposal_html, `Proposal_${currentTrackingClient.company}_v${verId||pData.versions.length}.pdf`);
    } catch { showToast('No proposal found', 'error'); }
    btn.textContent = ogText;
    btn.disabled = false;
});

/* ── DOCX Download ── */
document.getElementById('downloadDocxBtn')?.addEventListener('click', async () => {
    if (!currentTrackingClient) return;
    const btn = document.getElementById('downloadDocxBtn');
    const ogText = btn.textContent;
    btn.textContent = 'Generating...';
    btn.disabled = true;
    try {
        const pData = await proposals.get(currentTrackingClient.client_id);
        const verId = document.getElementById('proposalModal').dataset.version;
        const pVer = verId ? pData.versions.find(x => x.version == parseInt(verId)) : pData.versions[pData.versions.length - 1];
        if (pVer && pVer.proposal_html) {
            await generateDocx(pVer.proposal_html, currentTrackingClient.company || 'Client');
            showToast('DOCX downloaded!', 'success');
        } else {
            showToast('No proposal found', 'error');
        }
    } catch (e) {
        showToast('DOCX export failed: ' + e.message, 'error');
    } finally {
        btn.textContent = ogText;
        btn.disabled = false;
    }
});

/* ══ LOGOUT / BACK ══ */
document.getElementById('staffLogout').addEventListener('click', () => { localStorage.removeItem('f_active_agent'); location.reload(); });
document.getElementById('logoutBtn').addEventListener('click', () => { window.location.href = window.location.pathname; });
document.getElementById('trackLogout').addEventListener('click', () => { localStorage.removeItem('f_active_agent'); location.reload(); });
document.getElementById('backToDashBtn').addEventListener('click', () => { hide('T'); show('H'); renderClientTable(); });

/* ══ THEME ══ */
function initTheme() {
    const saved = localStorage.getItem('f_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    ['themeToggleH', 'themeToggleT', 'themeToggleA', 'themeToggleL'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.onclick = toggleTheme;
    });
}
function toggleTheme() {
    const cur  = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('f_theme', next);
}

/* ══ PASSWORD TOGGLE ══ */
function initPasswordToggle() {
    document.getElementById('pwToggle')?.addEventListener('click', () => {
        const inp = document.getElementById('pw');
        inp.type = inp.type === 'password' ? 'text' : 'password';
    });
}

/* ══ UI HELPERS ══ */
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }

function showLdr(txt, pct = null) {
    const l  = document.getElementById('ldr');
    l.classList.remove('hidden');
    document.getElementById('ltxt').textContent = txt;
    const pb = document.getElementById('ldrPb');
    if (pb) { pb.style.display = pct !== null ? 'block' : 'none'; if (pct !== null) pb.style.width = pct + '%'; }
    spawnParticles();
    gsap.fromTo(l, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' });
}
function hideLdr() {
    const l = document.getElementById('ldr');
    gsap.to(l, { opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: () => l.classList.add('hidden') });
}

function spawnParticles() {
    const container = document.getElementById('ldrParticles');
    if (!container || container.childElementCount > 15) return;
    container.innerHTML = '';
    for (let i = 0; i < 12; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.top = 40 + Math.random() * 50 + '%';
        p.style.animationDelay = Math.random() * 3 + 's';
        p.style.animationDuration = 2 + Math.random() * 2 + 's';
        p.style.width = p.style.height = 2 + Math.random() * 3 + 'px';
        container.appendChild(p);
    }
}

function setStg(i, st) {
    const d = document.getElementById('s' + i), l = document.getElementById('sl' + i);
    if (!d || !l) return;
    d.className = 'stage-num ' + st;
    l.className = 'stage-lbl ' + st;
}
function setPhase(txt) { document.getElementById('phaseTxt').textContent = txt; }
function updateCov(p) { document.getElementById('cvb').style.width = p + '%'; document.getElementById('cvp').textContent = p + '%'; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function mdToHtml(text) {
    return text
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
}

function addAg(msg, opts = {}) {
    const f = document.getElementById('feed');
    const d = document.createElement('div');
    d.className = 'msg ag';
    const rendered = opts.noEscape ? msg : mdToHtml(msg);
    if (opts.noEscape) {
        d.innerHTML = `<div class="msg-av">F</div><div class="msg-bubble msg-bubble-wide">${rendered}</div>`;
    } else {
        d.innerHTML = `<div class="msg-av">F</div><div class="msg-bubble">${rendered}</div>`;
    }
    if (opts.inds) {
        const wrap = document.createElement('div');
        wrap.className = 'industry-btns';
        opts.inds.forEach(ind => {
            const btn = document.createElement('button');
            btn.className = 'ind-btn';
            btn.textContent = ind;
            btn.onclick = () => {
                prof.confirmed = ind;
                document.querySelectorAll('.ind-btn').forEach(b => b.disabled = true);
                addUs(ind); setStg(1, 'done'); beginGather();
            };
            wrap.appendChild(btn);
        });
        d.querySelector('.msg-bubble').appendChild(wrap);
    }
    if (opts.video) {
        const vid = document.createElement('div');
        vid.className = 'video-placeholder'; vid.style.marginTop = '12px'; vid.style.height = '120px';
        vid.innerHTML = `<div class="vp-inner"><div class="vp-play">▶</div><div class="vp-text">Strategy Brief</div></div>`;
        vid.onclick = () => openModal('videoModal');
        d.querySelector('.msg-bubble').appendChild(vid);
    }
    f.appendChild(d);
    f.scrollTop = f.scrollHeight;
    saveConversationMemory();

    // Trigger TTS if calling mode is ON and not a restored message
    if (callingMode && !opts.restored) {
        playVoice(msg);
    }
}


async function playVoice(text) {
    if (!text) return;
    const cleanText = text.replace(/<[^>]*>/g, '').replace(/\*\*|__|#|`|\[|\]|\(|\)/g, '').replace(/\s+/g, ' ').trim();
    if (!cleanText) return;
    
    voiceQueue.push(cleanText);
    if (!isProcessingVoice) processVoiceQueue();
}

async function processVoiceQueue() {
    if (voiceQueue.length === 0) {
        isProcessingVoice = false;
        return;
    }
    isProcessingVoice = true;
    const text = voiceQueue.shift();

    try {
        // Stop any current audio before fetching new ones
        if (currentAudioSource) {
            try { currentAudioSource.stop(); } catch(e){}
            currentAudioSource = null;
        }

        const data = await voice.speak(text);
        if (data && data.audio) {
            const audioData = atob(data.audio);
            const arrayBuffer = new ArrayBuffer(audioData.length);
            const view = new Uint8Array(arrayBuffer);
            for (let i = 0; i < audioData.length; i++) view[i] = audioData.charCodeAt(i);
            
            if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') await audioContext.resume();
            
            const buffer = await audioContext.decodeAudioData(arrayBuffer);
            const source = audioContext.createBufferSource();
            source.buffer = buffer;
            source.connect(audioContext.destination);

            // Strict lockout right before start
            if (currentAudioSource) {
                try { currentAudioSource.stop(); } catch(e){}
            }
            currentAudioSource = source;

            const waves = document.querySelectorAll('.voice-wave, .large-voice-wave');
            waves.forEach(w => w.classList.add('active'));

            source.onended = () => {
                if (currentAudioSource === source) {
                    currentAudioSource = null;
                    waves.forEach(w => w.classList.remove('active'));
                    
                    const mic = document.getElementById('micBtn');
                    const callBtn = document.getElementById('callToggleBtn');
                    if (callingMode && mic && !mic.classList.contains('mic-listening')) {
                        mic.click();
                    }
                }
                processVoiceQueue(); // Handle next in queue
            };
            source.start(0);
        } else {
            processVoiceQueue();
        }
    } catch (e) {
        console.warn('[Queue Error]', e);
        processVoiceQueue();
    }
}

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function addUs(msg) {
    const f = document.getElementById('feed');
    const d = document.createElement('div');
    d.className = 'msg u';
    d.innerHTML = `<div class="msg-av">U</div><div class="msg-bubble">${escHtml(msg)}</div>`;
    f.appendChild(d);
    f.scrollTop = f.scrollHeight;
    saveConversationMemory();
}

function showToast(message, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast-notification ${type}`;
    const icon = type === 'success'
        ? '<svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 8l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>';
    t.innerHTML = icon + message;
    document.body.appendChild(t);
    setTimeout(() => {
        t.classList.add('exiting');
        setTimeout(() => t.remove(), 300);
    }, 3000);
}

/* ══ BOOT ══ */
init();
