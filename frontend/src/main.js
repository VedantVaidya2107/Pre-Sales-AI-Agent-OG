import '../style.css';
import { auth, clients, tracking, proposals, email, documents, gem, ai, voice, safeJ } from './services/api.js';
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
let isFetchingReply = false; // Prevents overlapping Gemini calls in continuous mode
let callingMode = false;
let voiceEnabled = false; 
let audioContext = null;
let currentAudioSource = null; 
let voiceQueue = [];
let isProcessingVoice = false;
window.latestProposalHtml = ''; // Global for button access


/* ══ DISCOVERY STATE ══ */
const discoveryProgress = {
    metrics: false,
    economicBuyer: false,
    pain: false,
    champion: false,
    timeline: false
};

let voiceSocket = null;
let mediaRecorder = null;
let listening = false;
let globalStream = null; // Persistent stream for hands-free loop
let speechTimeout = null; // VAD auto-send timeout

/* ══ GLOBAL VOICE HELPERS ══ */
async function setMicState(active) {
    if (active) {
        if (!listening) {
            listening = true;
            const inp = document.getElementById('msgIn');
            if (inp) inp.value = '';
            await startRecording();
        }
    } else {
        if (listening) {
            stopRecording();
        }
    }
}

async function startRecording() {
    // Step 0: Ensure AudioContext is resumed (browser requirement)
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Step 1: Get mic access (Persist if already granted)
    if (!globalStream) {
        try {
            globalStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[Voice] Stream Captured Successfully');
        } catch (err) {
            console.error('[Mic Permission]', err);
            showToast('Microphone access denied.', 'error');
            listening = false;
            return;
        }
    }
    const stream = globalStream;

    // Step 2: Get Deepgram key
    let key;
    try {
        showToast('Connecting to voice service…', 'success');
        const dgData = await voice.getKey();
        key = dgData.key;
        if (!key || key === 'mock-key') throw new Error('No valid key from backend');
    } catch (err) {
        key = import.meta.env.VITE_DEEPGRAM_KEY || '6e712ff0167128210a0dae3fc2fcda370858fc7e';
    }

    // Step 3: Connect to Deepgram WebSocket
    try {
        console.log('[Voice] Opening WebSocket...');
        voiceSocket = new WebSocket(
            'wss://api.deepgram.com/v1/listen?interim_results=true&punctuate=true&language=en-IN&endpointing=500',
            ['token', key]
        );

        voiceSocket.onopen = () => {
            console.log('[Voice] WebSocket OPEN');
            const micBtn = document.getElementById('micBtn');
            if (micBtn) micBtn.classList.add('mic-listening');
            const waves = document.querySelectorAll('.voice-wave');
            waves.forEach(w => w.classList.add('active'));
            const inp = document.getElementById('msgIn');
            if (inp) inp.placeholder = 'Listening…';

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                ? 'audio/webm'
                : '';

            mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            mediaRecorder.addEventListener('dataavailable', async (event) => {
                if (event.data.size > 0 && voiceSocket && voiceSocket.readyState === WebSocket.OPEN) {
                    voiceSocket.send(event.data);
                }
            });
            console.log('[Voice] MediaRecorder START');
            mediaRecorder.start(250);
        };

        voiceSocket.onmessage = (message) => {
            const received = JSON.parse(message.data);
            const transcript = received.channel?.alternatives[0]?.transcript;
            const inp = document.getElementById('msgIn');
            
            if (transcript && !isFetchingReply) {
                // BARGE-IN: If agent is speaking, interrupt!
                if (isProcessingVoice || currentAudioSource || voiceQueue.length > 0) {
                    console.log('[Voice] BARGE-IN Detected! Stopping playback.');
                    if (currentAudioSource) { try { currentAudioSource.stop(); } catch(e){} currentAudioSource = null; }
                    voiceQueue = [];
                    isProcessingVoice = false;
                    const waves = document.querySelectorAll('.vco-wave, .voice-wave');
                    waves.forEach(w => w.classList.remove('active'));
                }

                if (callingMode) {
                    // Voice Agent Mode: Show in overlay and auto-send on silence
                    const statusText = document.getElementById('callOverlayStatus');
                    if (statusText) statusText.innerText = 'Listening...';
                    
                    if (received.is_final) {
                        inp.value += transcript + ' ';
                    }

                    clearTimeout(speechTimeout);
                    speechTimeout = setTimeout(() => {
                        if (inp?.value.trim().length > 0) {
                            console.log('[Voice] VAD Timeout triggers send.');
                            if (statusText) statusText.innerText = 'AI Thinking...';
                            document.getElementById('sendBtn').click();
                        }
                    }, 2000);

                    if (received.speech_final && inp?.value.trim().length > 0) {
                        clearTimeout(speechTimeout);
                        console.log('[Voice] Deepgram Endpointing triggers send.');
                        if (statusText) statusText.innerText = 'AI Thinking...';
                        document.getElementById('sendBtn').click();
                    }
                } else {
                    // Manual Voice Typing (Mic) mode: Just append to input, do NOT auto-send.
                    if (received.is_final) {
                        inp.value += transcript + ' ';
                        inp.focus();
                    } else {
                        inp.placeholder = transcript + '...';
                    }
                }
            }
        };

        voiceSocket.onclose = () => {
            console.log('[Voice] WebSocket CLOSE');
            // If we are still in calling mode, we should NOT call stopRecording,
            // as we want to stay "Listening". But if it closed unexpectedly,
            // we might need a reconnect logic later. For now, stop only if call is over.
            if (!callingMode) stopRecording();
        };

        voiceSocket.onerror = (err) => {
            console.error('[Voice] WebSocket ERROR:', err);
            if (globalStream) {
                globalStream.getTracks().forEach(t => t.stop());
                globalStream = null;
            } else {
                if(stream) stream.getTracks().forEach(t => t.stop());
            }
            showToast('Deepgram connection failed.', 'error');
            stopRecording();
        };
    } catch (err) {
        console.error('[Voice] Setup Failed:', err);
        if (globalStream) {
            globalStream.getTracks().forEach(t => t.stop());
            globalStream = null;
        } else {
            stream.getTracks().forEach(t => t.stop());
        }
        listening = false;
    }
}

function stopRecording() {
    listening = false;
    clearTimeout(speechTimeout);
    
    // Reset all voice button UI states
    const mic = document.getElementById('micBtn');
    const vaBtn = document.getElementById('voiceAgentBtn');
    
    if (mic) mic.classList.remove('mic-listening');
    if (vaBtn) {
        vaBtn.style.background = '';
        vaBtn.style.borderColor = '';
        const dot = vaBtn.querySelector('.calling-dot');
        if (dot) dot.style.display = 'none';
    }

    const waves = document.querySelectorAll('.voice-wave, .large-voice-wave');
    waves.forEach(w => w.classList.remove('active'));
    const inp = document.getElementById('msgIn');
    if (inp) inp.placeholder = 'Type your response…';
    
    if (mediaRecorder) { try { mediaRecorder.stop(); } catch(e){} mediaRecorder = null; }
    if (voiceSocket)   { try { voiceSocket.close(); } catch(e){} voiceSocket = null; }
}

async function initVoice() {
    const micBtn = document.getElementById('micBtn');
    if (micBtn) {
        micBtn.onclick = () => {
            // If already in Voice Agent mode, do nothing or prompt to end call
            if (callingMode) {
                showToast('Please end the call to use manual mic.', 'warning');
                return;
            }
            if (listening) setMicState(false);
            else setMicState(true);
        };
    }
}

async function initVoiceAgent() {
    const btn = document.getElementById('voiceAgentBtn');
    const endBtn = document.getElementById('endCallBtn');
    if (!btn) return;
    
    btn.onclick = async () => {
        if (callingMode) return; // Already in call
        
        // Activate Voice Agent Full-Screen
        callingMode = true;
        console.log('[VoiceAgent] Full-Screen Call Activated');
        
        // UI Transition
        const overlay = document.getElementById('callOverlay');
        if (overlay) overlay.classList.remove('hidden');
        
        const statusText = document.getElementById('callOverlayStatus');
        if (statusText) statusText.innerText = 'Connecting...';

        // Ensure AudioContext is ready
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') await audioContext.resume();
        
        // GSAP Animation
        gsap.fromTo('.voice-call-overlay', 
            { opacity: 0, scale: 1.05 }, 
            { opacity: 1, scale: 1, duration: 0.5, ease: 'power3.out' }
        );
        
        // Start recording
        await setMicState(true);
        
        if (statusText) statusText.innerText = 'Listening...';
        if (activeClientId) tracking.logEvent(activeClientId, 'voice_call_started');
    };

    if (endBtn) {
        endBtn.onclick = () => {
            callingMode = false;
            console.log('[VoiceAgent] Call Ended');
            
            // Teardown
            if (globalStream) {
                globalStream.getTracks().forEach(t => t.stop());
                globalStream = null;
            }
            voiceQueue = [];
            isProcessingVoice = false;
            isFetchingReply = false;
            
            if (currentAudioSource) {
                try { currentAudioSource.stop(); } catch(e){}
                currentAudioSource = null;
            }
            
            setMicState(false);
            stopRecording();

            // UI Transition
            const overlay = document.getElementById('callOverlay');
            gsap.to('.voice-call-overlay', { 
                opacity: 0, 
                scale: 1.05, 
                duration: 0.4, 
                onComplete: () => overlay.classList.add('hidden')
            });
            
            showToast('Voice Call Ended.');
        };
    }
}

/* ══ FRISTINE AI PRE-SALES ARCHITECT (SYSTEM INSTRUCTIONS) ══ */
const ZK = `### Role: Fristine AI Pre-Sales Architect (OG)
You are the expert multi-agent system designed to conduct structured, MEDDPICC-driven discovery for Zoho transformations. You represent Fristine Infotech, a Premium Zoho Partner with offices in Mumbai, Pune, and Dubai.

### Core Capability:
1. Conduct discovery for CRM, Desk, Analytics, and Books implementations.
2. Follow MEDDPICC logic to qualify leads:
   - Metrics (ROI/KPIs)
   - Economic Buyer (Stakeholders)
   - Decision Criteria (Tech/Integration needs)
   - Decision Process (Workflow mapping)
   - Paper Process
   - Identify Pain (Operational Bottlenecks)
   - Champion identification.

### Core Behavior Rules:
1. **Persistence & State-Awareness**: Acknowledge previous context if the user returns.
2. **Authority**: Speak as a Solution Architect + Business Consultant.
3. **Zoho Product Matrix**: Map use cases intelligently:
   - Complaint Management -> Zoho Desk + Analytics
   - Sales Automation -> Zoho CRM + Campaigns
   - Support -> Zoho Desk
   - Finance -> Zoho Books
4. **Mandatory Disclosures**: 
   - Licensing is separate from implementation fees.
   - Standard terms: 60% advance / 40% sign-off.
   - 30 days of Hypercare included.
5. **Conciseness**: Keep responses professional and under 60 words.

### Interaction Style:
- Use **consulting tone** (Accenture/Deloitte style).
- Extract requirements and fill gaps intelligently without asking unnecessary questions.
- Focus on business impact (ROI) and technical feasibility (Integrations).`;

/* ══ PROPOSAL INTELLIGENCE LAYER (OG SPECIFICATION) ══ */
const PROPOSAL_SPECIALIST_PROMPT = `### Role Definition: Fristine AI Pre-Sales Architect (Proposal Intelligence Layer)
You are the OG expert multi-agent system designed to conduct structured discovery and generate enterprise-grade implementation proposals for Fristine Infotech.

### Core Capability:
Generate proposals matching "Fristine DNA": boardroom-ready, highly structured, consulting-grade (Accenture/Deloitte style), and technically accurate.

### Proposal Structure (STRICT - DO NOT CHANGE ORDER):
1. About Fristine Infotech
2. Executive Summary
3. Client Objective / Business Context
4. Proposed Solution (Zoho Stack Explanation)
5. Scope of Work (CRM, Desk, Analytics, etc.)
6. Integrations (SAP, WhatsApp, SMS, Webforms, etc.)
7. Data Migration
8. Delivery Model / Project Plan
9. Timeline
10. Project Team
11. Governance & Escalation Matrix
12. Detailed Scope of Work (Workflow & Module-level breakdown with limits e.g. "Up to 5 workflows")
13. Commercials (structured table)
14. Payment Terms (60% Advance / 40% UAT)
15. Assumptions & Constraints
16. Run Model / Managed Services
17. Annexure (for complex enterprise use cases)

### Intelligence Rules:
- **Tone**: Professional business English, active voice, 4K quality technical detail.
- **Mapping**: Convert pain points to specific Zoho cures.
- **Limits**: Add concrete limits to scope (layouts, approvals, automated rules).
- **Architecture**: Smartly include CAPA, SLA/TAT tracking, and DOP approval logic for CCMS/Enterprise.
- **Commercials**: Include workshops, solution design, QA, and 30-day Hypercare.`;

let isAppInitialized = false;

async function checkAiHealth() {
    const aiBadge = document.getElementById('aiStatus');
    const voiceBadge = document.getElementById('voiceStatus');
    
    // AI Status Check
    if (aiBadge) {
        try {
            const res = await ai.getStatus();
            if (res.status === 'ok') {
                aiBadge.style.borderColor = 'var(--green)';
                aiBadge.style.color = 'var(--green)';
                aiBadge.innerHTML = `<span class="phase-dot" style="background:var(--green)"></span> AI Online`;
            } else {
                 aiBadge.style.borderColor = 'var(--red)';
                 aiBadge.style.color = 'var(--red)';
                 aiBadge.innerHTML = `<span class="phase-dot" style="background:var(--red)"></span> AI Error`;
            }
        } catch {
            aiBadge.style.borderColor = 'var(--red)';
            aiBadge.innerHTML = `<span class="phase-dot" style="background:var(--red)"></span> AI Offline`;
        }
    }

    // Voice Status Check
    if (voiceBadge) {
        try {
            const res = await voice.getStatus();
            if (res.status === 'ok') {
                voiceEnabled = true;
                voiceBadge.style.borderColor = 'var(--green)';
                voiceBadge.style.color = 'var(--green)';
                voiceBadge.innerHTML = `<span class="phase-dot" style="background:var(--green)"></span> Voice Online`;
            } else {
                 voiceBadge.style.borderColor = 'var(--red)';
                 voiceBadge.style.color = 'var(--red)';
                 voiceBadge.innerHTML = `<span class="phase-dot" style="background:var(--red)"></span> Voice Error`;
            }
        } catch {
            voiceBadge.style.borderColor = 'var(--red)';
            voiceBadge.innerHTML = `<span class="phase-dot" style="background:var(--red)"></span> Voice Offline`;
        }
    }
}


/* ══ BOOT ══ */
async function init() {
    initVoice();
    initVoiceAgent();
    initKpis();
    initMobileMenu();
    checkAiHealth();
    setInterval(checkAiHealth, 60000); // Check every minute
    
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('client');
    
    // Explicit Logout Check (Fixes teleportation bug)
    if (params.get('loggedout')) {
        localStorage.removeItem('f_active_agent');
        localStorage.removeItem('f_bot_memory');
        window.history.replaceState({}, document.title, window.location.pathname);
        showLdr('Logged out successfully...');
        setTimeout(() => hideLdr(), 1000);
        await bootStaffLogin();
        return;
    }

    // Client/Agent Exit Check
    if (params.get('exit')) {
        window.history.replaceState({}, document.title, window.location.pathname);
        hideLdr();
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        show('SE'); 
        return;
    }




    if (clientId) {
        activeClientId = clientId;
        await bootClientSession(clientId);
    } else {
        await bootStaffLogin();
    }

    // 2K Staggered Dashboard Reveal
    gsap.from('.stat-card', { 
        y: 20, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power2.out', delay: 0.4 
    });
    gsap.from('.metrics-section, .table-wrap', {
        y: 30, opacity: 0, duration: 0.8, delay: 0.8, ease: 'expo.out'
    });

    document.getElementById('timeFilter')?.addEventListener('change', () => renderPipelineTrends());


    // Performance: Only animate if visible
    document.querySelectorAll('.stat-card').forEach(card => observer.observe(card));

    // ─── Mobile Menu Toggle Logic ───
    const side = document.querySelector('.bot-sidebar');
    const toggleMenu = () => side?.classList.toggle('open');
    
    document.getElementById('menuToggleH')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.getElementById('menuToggleA')?.addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    
    // Close menu when clicking outside (on the chat panel)
    document.querySelector('.chat-panel')?.addEventListener('click', () => {
        if (side?.classList.contains('open')) side.classList.remove('open');
    });
}

async function bootStaffLogin() {
    showLdr('Connecting to portal…');
    const wakeUpTimer = setTimeout(() => {
        setSS('ok', 'Render service is cold-starting... please wait ~60s');
    }, 6000);

    try {
        console.log('[Boot] Attempting clients.list()...');
        allClients = await clients.list();
        clearTimeout(wakeUpTimer);
        setSS('ok', `Connected · ${allClients.length} clients loaded`);
        const activeAgent = localStorage.getItem('f_active_agent');
        if (activeAgent) {
            startStaffPortal(activeAgent);
        }
    } catch (e) {
        console.error('[Boot] Connection failed', e);
        clearTimeout(wakeUpTimer);
        // Show actual reason if possible
        if (e.message === 'Failed to fetch' || e.name === 'TypeError') {
            setSS('er', 'Network error: Is the backend URL set correctly? Check Console (F12).');
        }
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

/* ── Captcha Logic ── */
let currentCaptchaAnswer = null;
function initCaptcha() {
    generateCaptcha();
}
function generateCaptcha() {
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    currentCaptchaAnswer = a + b;
    const box = document.getElementById('captchaBox');
    if (box) box.textContent = `${a} + ${b}`;
    const inp = document.getElementById('captchaIn');
    if (inp) inp.value = '';
}
function validateCaptcha() {
    const val = document.getElementById('captchaIn').value.trim();
    if (parseInt(val) !== currentCaptchaAnswer) {
        showToast('Incorrect security answer.', 'error');
        generateCaptcha();
        return false;
    }
    return true;
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

    if (!validateCaptcha()) return;

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

document.getElementById('backToLoginFromFP').addEventListener('click', () => { hide('FP'); show('L'); generateCaptcha(); });
document.getElementById('backToLoginBtn2').addEventListener('click', () => { hide('FP'); show('L'); generateCaptcha(); });

/* ── Signup Logic ── */
document.getElementById('showSignupBtn').addEventListener('click', () => { hide('L'); show('SU'); });
document.getElementById('backToLoginSU').addEventListener('click', () => { hide('SU'); show('L'); generateCaptcha(); });

document.getElementById('signupBtn').addEventListener('click', async () => {
    const em = document.getElementById('su-em').value.trim().toLowerCase();
    const name = document.getElementById('su-name').value.trim();
    const pw1 = document.getElementById('su-pw1').value.trim();
    const pw2 = document.getElementById('su-pw2').value.trim();
    const err = document.getElementById('su-err');
    err.textContent = '';

    if (!em.endsWith('@fristinetech.com')) { err.textContent = 'Must use a @fristinetech.com email.'; return; }
    if (!name) { err.textContent = 'Please enter your name.'; return; }
    if (pw1.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
    if (pw1 !== pw2) { err.textContent = 'Passwords do not match.'; return; }

    const btn = document.getElementById('signupBtn');
    btn.disabled = true; btn.textContent = 'Creating Account…';

    try {
        // auth.setPassword can be used for new account creation too if backend handles it
        // Now sending the 'name' field correctly to the backend
        await auth.setPassword(em, pw1, name); 
        // Note: For a real app, you'd also save the name, but here we prioritize password setup.
        showToast('Account created successfully!', 'success');
        localStorage.setItem('f_active_agent', em);
        allClients = await clients.list();
        hide('SU');
        startStaffPortal(em);
    } catch (e) {
        err.textContent = e.message || 'Registration failed.';
    } finally {
        btn.disabled = false; btn.textContent = 'Create Account & Join →';
    }
});

/* ══ STAFF PORTAL ══ */
async function startStaffPortal(agentEmail) {
    if (agentEmail) document.getElementById('agentChip').textContent = agentEmail.split('@')[0];
    hide('L'); hide('SP'); hide('FP');
    show('H');
    initKpis();
    await renderClientTable();
    animateDashboardEntrance();
}

function animateDashboardEntrance() {
    // Staggered card entrance with physics-based easing
    gsap.from('.stat-card', {
        y: 60,
        opacity: 0,
        stagger: 0.12,
        duration: 0.8,
        ease: 'back.out(1.4)',
        clearProps: 'all'
    });
    
    // Table container lift
    gsap.from('.table-wrap', { 
        opacity: 0, y: 30, 
        duration: 0.6, delay: 0.4, 
        ease: 'power3.out' 
    });

    // Table rows cascade
    gsap.delayedCall(0.5, () => {
        gsap.from('.client-row-visible', {
            x: -30,
            opacity: 0,
            stagger: 0.08,
            duration: 0.6,
            ease: 'power2.out'
        });
    });
}

function animateRows(selector) {
    gsap.from(selector, {
        opacity: 0, x: -15, 
        duration: 0.4, stagger: 0.05, 
        ease: 'power2.out', clearProps: 'all'
    });
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
    if (!tbody) return;

    if (forceRefresh) {
        try { allClients = await clients.list(); } catch (e) { console.warn('[Table] Refresh fail:', e); }
        await loadClientStatuses();
    }

    // 1. SPECIFIC DATE FILTERING (Month/Year)
    const mPick = document.getElementById('monthPicker')?.value || 'all';
    const yPick = document.getElementById('yearPicker')?.value || 'all';
    
    const dateFiltered = allClients.filter(c => {
        const date = new Date(c.created_at);
        const mMatch = mPick === 'all' || date.getMonth().toString() === mPick;
        const yMatch = yPick === 'all' || date.getFullYear().toString() === yPick;
        return mMatch && yMatch;
    });

    // 2. CALCULATE KPIS FOR SELECTED PERIOD
    let sentCount = 0, activeCount = 0, proposalCount = 0;
    dateFiltered.forEach(c => {
        const s = clientStatuses[c.client_id];
        if (s) {
            if (s.sent || s.accessed) sentCount++;
            if (s.active) activeCount++;
            if (s.totalProposal) proposalCount++;
        }
    });

    // 3. UPDATE KPIS & MICRO-TRENDS
    const updateKpi = (id, val, trend, color) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = val;
        const lbl = el.parentElement.querySelector('.stat-lbl');
        if (lbl && !lbl.querySelector('.stat-delta')) {
            const span = document.createElement('span');
            span.className = 'stat-delta';
            span.style.cssText = `color:var(--${color});font-size:10px;margin-left:5px;font-weight:800`;
            span.textContent = trend;
            lbl.appendChild(span);
        }
    };

    updateKpi('statTotal', dateFiltered.length, '↑ 12%', 'green');
    updateKpi('statSent', sentCount, '↑ 2.4%', 'blue-acc');
    updateKpi('statActive', activeCount, '~ stable', 'amber');
    updateKpi('statProposal', proposalCount, '↑ 8%', 'green');

    document.getElementById('clientCount').textContent = `${dateFiltered.length} clients in this period`;

    // 4. VIEW FILTERING (Search + KPI Phase)
    let viewFiltered = dateFiltered;
    if (filter) {
        const f = filter.toLowerCase();
        viewFiltered = viewFiltered.filter(c => 
            (c.company || '').toLowerCase().includes(f) ||
            (c.email || '').toLowerCase().includes(f) ||
            (c.industry || '').toLowerCase().includes(f)
        );
    }
    
    if (activeKpiFilter !== 'all') {
        const phase = activeKpiFilter;
        viewFiltered = viewFiltered.filter(c => {
            const s = clientStatuses[c.client_id];
            if (!s) return false;
            if (phase === 'sent') return s.sent || s.accessed;
            if (phase === 'active') return s.active;
            if (phase === 'proposal') return s.totalProposal;
            return true;
        });
    }

    // 5. RENDER TABLE ROWS
    if (viewFiltered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="tbl-empty">${filter ? 'No records matching search.' : 'No records for this period.'}</td></tr>`;
        renderPipelineTrends();
        return;
    }

    tbody.innerHTML = '';
    viewFiltered.forEach(client => {
        try {
            const clientId = client.client_id || 'ID-ERR';
            const status   = clientStatuses[clientId] || getClientStatus([]);
            const coName   = client.company || 'Unknown Company';
            const coIco    = coName.charAt(0).toUpperCase() || '?';

            const tr = document.createElement('tr');
            tr.className = 'client-row-visible';
            tr.innerHTML = `
                <td>
                    <div class="tbl-co-wrap">
                        <div class="tbl-co-ico">${coIco}</div>
                        <div><div class="tbl-co-name">${coName}</div><div class="tbl-co-id">${clientId}</div></div>
                    </div>
                </td>
                <td class="tbl-cell-visible"><span class="tbl-industry">${client.industry || '—'}</span></td>
                <td class="tbl-cell-visible"><span class="tbl-email">${client.email || '—'}</span></td>
                <td class="tbl-cell-visible">${renderStatusBadge(status)}</td>
                <td>
                    <div class="tbl-actions">
                        <button class="btn-tbl btn-tbl-send">Bot</button>
                        <button class="btn-tbl btn-tbl-call" style="background:var(--green);border-color:var(--green);">Call</button>
                        <button class="btn-tbl btn-tbl-edit" style="background:var(--blue-acc);border-color:var(--blue-acc);">Edit</button>
                        <button class="btn-tbl btn-tbl-track">Track</button>
                        <button class="btn-tbl btn-tbl-del">Del</button>
                    </div>
                </td>`;
            
            tbody.appendChild(tr);

            const attachListener = (selector, action) => {
                const el = tr.querySelector(selector);
                if (el) el.addEventListener('click', (e) => { e.stopPropagation(); action(); });
            };

            attachListener('.btn-tbl-send', () => sendBotEmail(clientId));
            attachListener('.btn-tbl-call', () => triggerOutboundCall(clientId));
            attachListener('.btn-tbl-edit', () => openEditLead(clientId));
            attachListener('.btn-tbl-track',() => openTracking(clientId));

        } catch (err) { console.error('[Table] Row render fail:', err); }
    });

    renderPipelineTrends();
}

function renderPipelineTrends() {
    const grid = document.getElementById('metricsGrid');
    if (!grid) return;

    const mPick = document.getElementById('monthPicker')?.value || 'all';
    const yPick = document.getElementById('yearPicker')?.value || 'all';

    let filter = 'all';
    if (mPick !== 'all' || yPick !== 'all') {
        // Granular mode: deactivate presets
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    } else {
        const activeBtn = document.querySelector('.filter-btn.active');
        filter = activeBtn ? activeBtn.dataset.val : 'all';
    }

    const now = new Date();
    const months = [];
    
    // Determine month count: 3, 6, 12 or all (default 12 for trends)
    let monthCount = 12;
    if (filter === '3') monthCount = 3;
    else if (filter === '6') monthCount = 6;
    else if (filter === '12') monthCount = 12;

    for (let i = monthCount - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
            label: d.toLocaleString('en-US', { month: 'short' }),
            count: 0
        });
    }

    allClients.forEach(c => {
        if (!c.created_at) return;
        const cd = new Date(c.created_at);
        const key = `${cd.getFullYear()}-${String(cd.getMonth() + 1).padStart(2, '0')}`;
        const match = months.find(m => m.key === key);
        if (match) match.count++;
    });

    const max = Math.max(...months.map(m => m.count), 1);
    grid.innerHTML = months.map((m, idx) => {
        const h = (m.count / max) * 100;
        const delay = idx * 0.05;
        const isCurrentPick = (mPick !== 'all' && m.key.endsWith(String(parseInt(mPick)+1).padStart(2, '0')));
        const glow = isCurrentPick ? 'box-shadow: 0 0 20px rgba(var(--orange-rgb), 0.4); border: 2px solid var(--orange)' : '';
        
        return `
            <div class="trend-col">
                <div class="trend-val" style="${isCurrentPick ? 'opacity:1; color:var(--orange)' : ''}">${m.count} Leads</div>
                <div class="trend-bar-wrap" style="${glow}">
                    <div class="trend-bar" style="--final-height: ${h}%; animation-delay: ${delay}s; ${isCurrentPick ? 'background:var(--orange)' : ''}"></div>
                </div>
                <div class="trend-lbl" style="${isCurrentPick ? 'color:var(--text)' : ''}">${m.label}</div>
            </div>
        `;
    }).join('');
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
    if (s.active)    return '<span class="badge badge-active active"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M2 4h12v7a2 2 0 01-2 2H4a2 2 0 01-2-2V4z" stroke="currentColor" stroke-width="1.5"/><path d="M5 7.5h6M5 10h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> In Session</span>';
    if (s.accessed)  return '<span class="badge badge-accessed"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M8 3C4 3 1 8 1 8s3 5 7 5 7-5 7-5-3-5-7-5z" stroke="currentColor" stroke-width="1.5"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/></svg> Accessed</span>';
    if (s.sent)      return '<span class="badge badge-sent"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M2 4l6 4 6-4M2 4h12v8H2V4z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Sent</span>';
    return '<span class="badge badge-pending"><svg viewBox="0 0 16 16" width="12" height="12" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3l2 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Not Started</span>';
}

/* ── Search ── */
document.getElementById('searchInput')?.addEventListener('input', e => {
    renderClientTable(e.target.value.trim().toLowerCase());
});

document.getElementById('filterGroup')?.addEventListener('click', e => {
    if (e.target.classList.contains('filter-btn')) {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        // Reset granular pickers
        if (document.getElementById('monthPicker')) document.getElementById('monthPicker').value = 'all';
        if (document.getElementById('yearPicker')) document.getElementById('yearPicker').value = 'all';
        renderClientTable('', false);
    }
});

// Month/Year Pickers
['monthPicker', 'yearPicker'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        renderClientTable('', false);
    });
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

/* ══ MAKE CALL ══ */
async function makeCall(phone, company, clientId = null) {
    console.log(`[Call] makeCall targeting: ${phone} (${company}, ID: ${clientId})`);
    if (!phone) {
        console.warn('[Call] Aborted: No phone number provided');
        showToast('No phone number found for this lead.', 'error');
        return;
    }
    // Proceed immediately to call initiation for better UX and reliability
    console.log(`[Call] Initiating request to backend for ${phone}...`);
    
    showLdr(`Dialing ${company}…`);
    try {
        await voice.call(phone, clientId);
        showToast('Call initiated successfully! Expect a ring shortly.', 'success');
    } catch (err) {
        console.error('[Call Error]', err);
        let msg = err.message || "Call failed.";
        
        // Handle structured error from backend (Error 21219)
        const d = err.data?.detail;
        if (d && typeof d === 'object') {
            if (d.code === 21219 || (d.error && d.error.includes('verified'))) {
                msg = "Twilio Trial: Phone number not verified. Please verify it in your Twilio Console.";
            } else if (d.error) {
                msg = d.error;
            }
        }
        
        showToast(msg, 'error');
    } finally {
        hideLdr();
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
    const ph  = document.getElementById('nl-ph').value.trim();
    if (!co || !em) { showToast('Company and email are required.', 'error'); return; }

    const btn = document.getElementById('saveLeadBtn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    try {
        await clients.create({ company: co, industry: ind, email: em, phone: ph });
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

async function openEditLead(clientId) {
    const client = allClients.find(c => c.client_id === clientId);
    if (!client) return;
    
    document.getElementById('el-co').value = client.company || '';
    document.getElementById('el-ind').value = client.industry || '';
    document.getElementById('el-em').value = client.email || '';
    document.getElementById('el-ph').value = client.phone || '';
    document.getElementById('el-id-display').textContent = clientId;
    document.getElementById('editLeadModal').dataset.clientId = clientId;
    
    openModal('editLeadModal');
}

async function triggerOutboundCall(clientId) {
    const c = allClients.find(i => i.client_id === clientId);
    if (!c) return showToast('Client not found.', 'error');

    // For better experience, we can prompt for verification of the phone number
    const targetPhone = c.phone || prompt(`Enter phone number for ${c.company}:`, "+91");
    if (!targetPhone) return;

    showToast(`Calling ${c.company} (${targetPhone})…`, 'info');
    
    try {
        const res = await voice.call(targetPhone, clientId);
        
        if (res.success) {
            showToast('Outbound call successful. Connecting to AI bot…', 'success');
            await tracking.logEvent(clientId, 'outbound_call_initiated', `SID: ${res.call_sid}`);
            renderClientTable('', false); // Update status badge
        }
    } catch (err) {
        console.error('[Call] Failed:', err);
        const code = err.response?.data?.detail?.code;
        if (code === 21219) {
            showToast('Twilio Restriction: Phone number not verified in trial console.', 'error', 6000);
        } else {
            showToast('Failed to initiate call. Check Twilio config/Ngrok.', 'error');
        }
    }
}

document.getElementById('updateLeadBtn').addEventListener('click', async () => {
    const clientId = document.getElementById('editLeadModal').dataset.clientId;
    const co = document.getElementById('el-co').value.trim();
    const ind = document.getElementById('el-ind').value.trim();
    const em = document.getElementById('el-em').value.trim();
    const ph = document.getElementById('el-ph').value.trim();
    
    if (!co || !em) { showToast('Company and email are required.', 'error'); return; }
    
    const btn = document.getElementById('updateLeadBtn');
    btn.textContent = 'Updating…'; btn.disabled = true;
    try {
        await clients.update(clientId, { company: co, industry: ind, email: em, phone: ph });
        showToast('Lead updated successfully!', 'success');
        closeModal('editLeadModal');
        await renderClientTable();
    } catch (e) {
        showToast('Update failed: ' + e.message, 'error');
    } finally {
        btn.textContent = 'Save Changes'; btn.disabled = false;
    }
});

document.getElementById('closeEditBtn').addEventListener('click', () => closeModal('editLeadModal'));
document.getElementById('cancelEditBtn').addEventListener('click', () => closeModal('editLeadModal'));

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
        console.log('[Tracking] Fetching proposals for:', clientId);
        const pData = await proposals.get(clientId); 
        console.log('[Tracking] Proposals received:', pData);
        if (pData && pData.versions && pData.versions.length > 0) {

            ps.style.display = 'block';
            let html = '<div class="section-title">Generated Proposals</div><div style="display:flex;flex-direction:column;gap:12px;">';
            
            const rev = [...pData.versions].reverse();
            rev.forEach(v => {
                const dateRaw = new Date(v.created_at || v.savedAt);
                const dateStr = isNaN(dateRaw) ? (v.created_at || v.savedAt || '—') : dateRaw.toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

                
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
        const url = `${window.location.origin}/?client=${encodeURIComponent(clientId)}`;
        
        const doCopy = (val) => {
            const btn = document.getElementById('copyLinkBtn');
            const originalHtml = btn.innerHTML;
            
            // Clipboard API (Best)
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(val).then(() => {
                    btn.textContent = 'Copied!';
                    showToast('Link copied to clipboard!', 'success');
                    setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
                }).catch(() => fallbackCopy(val, btn, originalHtml));
            } else {
                fallbackCopy(val, btn, originalHtml);
            }
        };

        const fallbackCopy = (val, btn, originalHtml) => {
            const input = document.createElement('input');
            input.value = val;
            input.style.position = 'fixed';
            input.style.opacity = '0';
            document.body.appendChild(input);
            input.focus();
            input.select();
            try {
                const success = document.execCommand('copy');
                if (success) {
                    btn.textContent = 'Copied!';
                    showToast('Link copied to clipboard!', 'success');
                } else {
                    showToast('Copy failed. Please copy manually.', 'error');
                }
            } catch (err) {
                console.error('Fallback copy failed:', err);
                showToast('Copy failed. Please copy manually.', 'error');
            }
            document.body.removeChild(input);
            setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
        };

        doCopy(url);
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
        <div class="event-row anim-row">
            <div class="event-icon">${evtIcons[e.event] || '<svg viewBox="0 0 18 18" width="16" height="16" fill="none"><circle cx="9" cy="9" r="7" stroke="var(--dim)" stroke-width="1.5"/></svg>'}</div>
            <div class="event-desc">${evtLabels[e.event] || e.event}</div>
            <div class="event-time">${formatTime(e.timestamp)}</div>
        </div>`).join('');
    animateRows('.anim-row');
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
            `Research ${cli.company} (${cli.industry}). Return a STRICT JSON object with these fields: industries (array), size, pain_points (array of 3), tech (high/mid/low), zoho_fit (array of 2).`,
            1000, 0.2, true, [], ZK
        );
        prof = safeJ(res) || fallback();
        renderSidebar();
    } catch (e) {
        console.error('[Gemini] Research failed:', e);
        prof = fallback();
        showToast('Initial research failed: ' + (e.message || 'API error'), 'error');
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
    setPhase('Discovery');
    showFeed();
    updateCov(10);
    
    // Rule 1: Proactive Exact Greeting
    const isOpen = convo.length === 0;
    const isRestored = convo.length > 0;
    
    if (isOpen) {
        const greet = "Hi! I’m your Fristine Infotech Presales Assistant. We help businesses solve complex problems through bespoke Zoho consultation and implementation. To help me draft a budgetary proposal for you, could you tell me which Zoho applications or business processes (Sales, CCMS, Marketing, or Support) you are looking to digitize today?";
        addAg(greet);
        convo.push({ role: 'assistant', content: greet });
    } else if (isRestored) {
        // Rule 2: State-Aware Resumption
        const welcome = "Glad to see you again! Let's pick up where we left off.";
        addAg(welcome);
        convo.push({ role: 'assistant', content: welcome });
    }
    
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
    const now = new Date();
    const today = now.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });
    const timeNow = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    
    const sys = `${ZK}\n\nTODAY'S DATE: ${today}\nCURRENT TIME: ${timeNow}\n\nRESEARCH CONTEXT for ${cli.company}:\n${JSON.stringify(prof)}\n${fileContent ? `UPLOADED FILE:\n${fileContent}\n` : ''}`;



    const phaseMap = {
        0: 'Phase 1: Intro',
        1: 'Phase 2: Pain & Metrics',
        2: 'Phase 3: Scoping',
        3: 'Phase 4: Validation',
        4: 'Phase 5: Closure'
    };

    let turnPrompt;
    if (fileContent) {
        // Document-Centric Validation Flow
        if (isOpen) {
            turnPrompt = `The user has provided a BRD/Requirement document. 
            Identify as a Strategic Solutions Architect. 
            Briefly summarize the core technical objective you found in the document (under 30 words) and ask if the user would like to dive into validating the technical integrations (e.g., SAP, Third-party APIs) or the internal workflow mapping.`;
        } else if (rn >= 10) {
            turnPrompt = `The discovery for the BRD-based requirements is complete. 
            Output REQUIREMENTS_COMPLETE followed by the full JSON summary reflecting the document-specific requirements.
            JSON SCHEMA: {
              "business_overview": "Summary", "departments": [], "current_tools": [], "pain_points": [], 
              "must_have": [], "nice_to_have": [], "automation_opportunities": [], "integrations": [], 
              "success_metrics": [], "zoho_products": [], "user_count": 0, "industry": "", "summary": "", "timeline": ""
            }`;
        } else {
            turnPrompt = `The user provided a BRD (File Content is present). 
            Skip generic introductory questions. Validate a specific complex technical requirement from the document (e.g. integrations, security, or specific data migration volumes). 
            Be professional, concise, and technical.`;
        }
    } else {
        // Standard Discovery Flow
        if (isOpen) {
            turnPrompt = `PHASE 1 (Intro): Start the consultation session for ${cli.company}.
            MANDATORY FLOW:
            1. GREETING: Use a time-based greeting (e.g., Good morning/Good evening) based on current time.
            2. IDENTITY: Identify as the Fristine AI Pre-Sales Architect.
            3. ORG INFO: Briefly mention Fristine's credentials (Zoho Premium Partner, 500+ successful Zoho implementations since 2014, offices in Mumbai/Pune/Dubai).
            4. RESEARCH: Mention you've researched ${cli.company} specifically for their work in ${prof.industries?.[0] || 'their sector'}.
            5. ASK: Pose your first strategic open-ended question to understand their biggest operational challenge today.
            BE PROFESSIONAL, AUTHORITATIVE, and CONCISE.`;
        } else if (rn >= 10) {
            turnPrompt = `PHASE 5 (Closure): Summarize all requirements in a professional Markdown Table format.
            MANDATORY: Use EXACT wording for the last sentence of your response: "Thank you! I have captured your requirements. A Fristine Solutions Architect will now review this to finalize your formal proposal within 24–48 hours."
            MANDATORY STEP 2: Write the exact keyword: REQUIREMENTS_COMPLETE 
            MANDATORY STEP 3: Provide the full ULTRA-DETAILED JSON summary block. 
            
            CRITICAL RULES:
            1. The "detailed_analysis" field MUST be a deep technical breakdown (5-8 paragraphs) of how Zoho solves their specific business challenges.
            2. "must_have" and "pain_points" MUST be granular technical items (e.g. "Real-time SAP S/4HANA OData Sync" instead of "Integrations").
            
            JSON SCHEMA: {
              "business_overview": "Summary", "detailed_analysis": "Long-form technical rationale", "departments": [], "current_tools": [], "pain_points": [], 
              "must_have": [], "nice_to_have": [], "automation_opportunities": [], "integrations": [], 
              "success_metrics": [], "zoho_products": [], "user_count": 0, "industry": "", "summary": "", "timeline": ""
            }`;
        } else {
            const curPhaseId = Math.floor(rn / 2); 
            const curPhase = phaseMap[curPhaseId] || phaseMap[4];
            
            // Explicit Detection for Company/Tech Inquiry (Handled before hitting Gemini API)
            const lastMsg = (convo.length > 0 ? convo[convo.length-1].content : "").toLowerCase();
            const isInquiry = ["fristine", "zoho", "who are you", "what is", "about", "your org", "yourself"].some(kw => lastMsg.includes(kw));

            if (isInquiry) {
                // Return a structured response from local memory immediately — saves API costs + works offline!
                return `Fristine Infotech (founded in 2014) is a Tier-1 Zoho Premium Partner with a track record of 500+ global deployments. We specialize in complex Zoho CRM, Books, and Creator transformations. My role today is to help architect your solution. Coming back to our discovery... what is the primary operational challenge you'd like to solve first?`;
            }

            turnPrompt = `Current Phase: ${curPhase}. Conduct discovery for ${cli.company}. 
            PROTOCOL RULES:
            1. For CCMS/Manufacturing: Ask about SAP S/4HANA, CAPA, and DOP approval needs.
            2. For Healthcare/Retail: Ask about SalesIQ, WhatsApp/Telephony, and pipelines.
            3. Mandatory Disclosure: Weave in License, 60/40 payment, or Hypercare info if it's the right time.
            4. Ask ONE technical specific question.
            5. Be extremely concise (<50 words).`;
        }
    }

    const resp = await gem(turnPrompt, rn >= 10 ? 2000 : 1000, 0.7, rn >= 10, convo, sys);
    
    // HUMAN_INTERVENTION_REQ Trigger Detection
    if (resp && resp.includes("I have notified the Fristine Presales Team")) {
        if (activeClientId) tracking.logEvent(activeClientId, 'HUMAN_INTERVENTION_REQ').catch(() => {});
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
            const sys = `[CONTEXT: Current Time is ${new Date().toLocaleString()}]\n\n${ZK}`;
        const ackResp = await gem(ackMsg, 500, 0.5, false, convo, sys);
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

    // if (discoveryComplete) discoveryComplete = false; // MOVED: now only reset if explicitly requested via "Changes Required"
    if (discoveryComplete && !msg.toLowerCase().includes('change') && !msg.toLowerCase().includes('wrong')) {
        // If discovery is done and user isn't asking for changes, don't re-run discovery loop
        addUs(msg);
        inp.value = ''; // FIX: Clear input immediately to prevent loop
        clearTimeout(speechTimeout); // FIX: Clear VAD timeout
        addAg("I've captured your requirements! I'm currently architecting your solution. You can also click 'Create Proposal' above to skip the wait.");
        return;
    }

    addUs(msg);
    convo.push({ role: 'user', content: msg });
    inp.value = '';
    rn++;
    updateCov(Math.min(95, 10 + rn * 8.5));
    evaluateDiscoveryCompleteness(msg);
    showTypingIndicator();
    isFetchingReply = true;
    try {
        const resp = await nextQ();
        removeTypingIndicator();
        isFetchingReply = false;
        
        if (!resp) return; 
        const potentialJson = safeJ(resp);
        if (resp.includes('REQUIREMENTS_COMPLETE')) {
            const parts = resp.split('REQUIREMENTS_COMPLETE');
            if (parts[0].trim()) addAg(parts[0].trim());
            reqs = safeJ(parts[1]) || { summary: 'Requirement analysis complete', must_have: ['Zoho Consultation'] };
            discoveryComplete = true;
            if (activeClientId) tracking.logEvent(activeClientId, 'proposal_generated').catch(() => {});
            showReqSummary();
        } else if (potentialJson && (potentialJson.must_have || potentialJson.pain_points)) {
            // Handle cases where the AI forced JSON output and omitted the keyword
            reqs = potentialJson;
            discoveryComplete = true;
            if (activeClientId) tracking.logEvent(activeClientId, 'proposal_generated').catch(() => {});
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
        isFetchingReply = false;
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
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && callingMode) {
            const btn = document.getElementById('endCallBtn');
            if (btn) btn.click();
        }
    });

    // Initial user gesture to warm up AudioContext for the entire session
    const warmupAudio = () => {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => console.log('[Voice] AudioContext Warmed Up via Gesture'));
        }
        // Remove listeners once warmed up
        window.removeEventListener('click', warmupAudio);
        window.removeEventListener('keydown', warmupAudio);
    };
    window.addEventListener('click', warmupAudio);
    window.addEventListener('keydown', warmupAudio);



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
    if (callingMode) {
        callingMode = false;
        toggleCallingMode();
    }
    const r = reqs || { summary: 'Ready to proceed.', must_have: [] };
    setStg(2, 'done'); setStg(3, 'act'); setPhase('Reviewing Requirements…');
    saveConversationMemory();

    const makeList = (arr) => (arr || []).map(i => `<li>${i}</li>`).join('');
    const products = r.zoho_products || [];
    const productChips = products.length ? products.map(p => `
        <span style="background:rgba(26,79,214,.08);color:#1A4FD6;border:1px solid rgba(26,79,214,.2);border-radius:20px;padding:4px 12px;font-size:11px;font-weight:600;display:inline-flex;align-items:center;gap:4px">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M4 8l3 3 5-5" stroke="#1A4FD6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            ${p}
        </span>`).join(' ') : '';

    const htmlIntro = `
    <div class="reqcard-full">
      <div class="reqcard-intro">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px">
                <div style="width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,var(--green),#10b981);display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(16,185,129,0.2)">
                    <svg viewBox="0 0 16 16" width="18" height="18" fill="none"><path d="M4 8l3 3 5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <strong style="font-size:16px;color:var(--navy);letter-spacing:-0.4px">High-Fidelity Discovery Report</strong>
            </div>
            <div style="font-size:11px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:1px;background:rgba(59,130,246,0.1);padding:4px 10px;border-radius:20px">Draft Verified</div>
        </div>
        <p style="font-size:13.5px;color:var(--slate);line-height:1.6;margin-bottom:0">We have successfully mapped your requirements to the <strong>Fristine CCMS Framework</strong>.</p>
      </div>`;

    const htmlBoxHead = `
      <div class="reqcard-box">
        <div class="reqcard-title">
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none"><rect x="4" y="3" width="12" height="15" rx="2" stroke="#fff" stroke-width="1.5"/><path d="M8 7h4M8 10h4M8 13h2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>
          Technical Requirement Specification — ${cli?.company || 'Project Alpha'}
        </div>
        
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:20px;padding:20px;background:#fff;border-bottom:1px solid var(--brd)">
            <div><div class="reqs-label">Target Industry</div><div style="font-size:14px;font-weight:700;color:var(--navy)">${r.industry || 'N/A'}</div></div>
            <div><div class="reqs-label">Scaled User Base</div><div style="font-size:14px;font-weight:700;color:var(--navy)">${r.user_count || 0} Users</div></div>
            <div><div class="reqs-label">Go-Live Milestone</div><div style="font-size:14px;font-weight:700;color:var(--primary)">${r.timeline || 'TBD'}</div></div>
        </div>`;

    const analysis = r.detailed_analysis ? `
        <div class="reqs-section" style="background:#f8fafc">
            <div class="reqs-label" style="color:var(--primary)">Strategic Technical Analysis</div>
            <div class="reqs-text" style="font-size:14px;line-height:1.8;color:var(--navy);font-weight:450">${mdToHtml(r.detailed_analysis)}</div>
        </div>` : '';

    const details = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--brd)">
            <div class="reqs-section" style="background:#fff;margin:0"><div class="reqs-label">Core Pain Points</div><ul class="reqs-list">${makeList(r.pain_points)}</ul></div>
            <div class="reqs-section" style="background:#fff;margin:0"><div class="reqs-label">Architectural Must-Haves</div><ul class="reqs-list">${makeList(r.must_have)}</ul></div>
        </div>

        <div class="reqs-section">
            <div class="reqs-label">Proposed Stack Componentry</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">${productChips}</div>
        </div>

        <div class="reqs-actions">
          <button class="reqs-btn-confirm" id="confirmProposal">
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 8l3 3 5-5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            Approve & Generate Proposal
          </button>
          <div style="display:flex;gap:8px;width:100%">
              <button class="reqs-btn-clarify" id="clarifyBtn" style="flex:1">Refine Requirements</button>
              <button class="reqs-btn-wrong" id="wrongBtn">Restart</button>
          </div>
        </div>
      </div>
    </div>`;

    addAg(htmlIntro + htmlBoxHead + analysis + details, { noEscape: true });
    
    // Auto-trigger proposal build after 5 seconds if no manual click
    const autoGenTimer = setTimeout(() => {
        if (discoveryComplete && !sol) {
            console.log('[Discovery] Auto-triggering proposal generation...');
            buildSolution();
        }
    }, 5000);

    setTimeout(() => {
        const confirmBtn = document.getElementById('confirmProposal');
        if (confirmBtn) {
            confirmBtn.onclick = () => {
                clearTimeout(autoGenTimer);
                buildSolution();
            };
        }

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
        const userPrompt = `Generate a fully detailed, enterprise-grade implementation proposal matching Fristine's "Proposal Intelligence" standard for ${cli.company}.
        
        INSTRUCTIONS:
        1. Follow the 17-section structure EXACTLY.
        2. Ensure technical accuracy for Zoho products.
        3. Use long-form, consulting-grade language (5-8 paragraphs per executive/objective section).
        4. Add module-level limits (e.g., "Up to 3 Page Layouts").
        5. Include CAPA and Approval logic for enterprise clients.
        
        RETURN RAW JSON ONLY.
        SCHEMA: {
            "title": "Project Title",
            "about_fristine": "Detailed section about Fristine Infotech credentials.",
            "executive_summary": "Extensive 6-10 paragraph summary for CXOs.",
            "client_objective": "Client Context & Pain Points mapping.",
            "proposed_solution": "In-depth Zoho stack explanation.",
            "scope_of_work": "Overall scope summary.",
            "integrations": [{"item": "Name", "detail": "Technical method (SAP/API/Middleware)"}],
            "data_migration": "Details on volume and T&M model.",
            "delivery_model": "Project plan details (Agile/SDLC).",
            "timeline": "Phase-wise timeline (Weeks).",
            "project_team": "Team structure (Architect, PM, Dev).",
            "governance": "Escalation & Monitoring matrix.",
            "detailed_sow": [{"module": "Name", "features": ["Feature with limit 1", "Feature with limit 2"]}],
            "commercials": [{"service": "Implementation Phase", "cost": "₹ (Quoted)", "model": "Fixed/T&M"}],
            "payment_terms": "60-40 split details.",
            "assumptions_constraints": ["Assumption 1", "Constraint 1"],
            "run_model": "12-month managed services option.",
            "annexure": "Technical specs/Annexure details."
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
    showLdr('Architecting Enterprise Proposal…');
    const fname   = `Fristine_Proposal_${(cli.company||'Client').replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.html`;
    const dateStr = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    
    // Helper to format paragraphs
    const fmt = (txt) => (txt || '').split('\n').filter(p => p.trim()).map(p => `<p>${p}</p>`).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"/>
    <title>Enterprise Proposal — ${cli.company}</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>
    <style>
        :root { --p:#1A56DB; --navy:#0F172A; --slate:#475569; --bg:#F8FAFC; --w:#FFFFFF; --brd:#E2E8F0; --gray:#F1F5F9; }
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family:'Inter', sans-serif; color:var(--navy); line-height:1.6; background:#F1F5F9; print-color-adjust:exact; }
        .page { max-width:1050px; margin:40px auto; background:var(--w); box-shadow:0 30px 60px rgba(15,23,42,0.1); position:relative; overflow:hidden; border-radius:16px; }
        
        /* Cover Page */
        .cover { height:1100px; display:flex; flex-direction:column; justify-content:center; padding:100px; background: radial-gradient(circle at 100% 0%, rgba(26,86,219,0.05) 0%, transparent 40%), linear-gradient(135deg, #fff 0%, #f8fafc 100%); position:relative; }
        .cover::after { content:''; position:absolute; bottom:0; left:0; width:100%; height:12px; background:var(--p); }
        .cover-logo { display:flex; align-items:center; gap:16px; margin-bottom:80px; }
        .logo-box { width:56px; height:56px; background:var(--navy); border-radius:14px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:800; font-size:26px; box-shadow:0 12px 24px rgba(15,23,42,0.2); }
        .logo-text { font-family:'DM Sans', sans-serif; font-weight:700; font-size:22px; color:var(--navy); letter-spacing:-0.5px; }
        .cover-tag { font-size:14px; font-weight:700; color:var(--p); text-transform:uppercase; letter-spacing:3px; margin-bottom:16px; }
        h1 { font-family:'DM Sans', sans-serif; font-size:56px; font-weight:700; color:var(--navy); line-height:1.1; letter-spacing:-2px; margin-bottom:24px; }
        .client-info { font-size:28px; font-weight:500; color:var(--slate); margin-bottom:60px; }
        
        .meta-card { background:var(--bg); border:1px solid var(--brd); border-radius:20px; padding:40px; display:grid; grid-template-columns:1fr 1fr; gap:32px; }
        .meta-item label { font-size:11px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:var(--slate); display:block; margin-bottom:6px; }
        .meta-item span { font-size:16px; font-weight:600; color:var(--navy); }

        /* General Sections */
        .section { padding:100px 100px 60px; position:relative; page-break-before:always; }
        .sec-head { display:flex; align-items:center; gap:20px; margin-bottom:50px; border-bottom:2px solid var(--gray); padding-bottom:16px; }
        .sec-num { font-family:'DM Sans', sans-serif; font-size:14px; font-weight:800; color:var(--p); background:rgba(26,86,219,0.1); padding:4px 12px; border-radius:6px; }
        .sec-title { font-family:'DM Sans', sans-serif; font-size:28px; font-weight:700; color:var(--navy); letter-spacing:-0.5px; }
        
        p { font-size:15px; color:#334155; line-height:1.8; margin-bottom:20px; text-align:justify; }
        h3 { font-family:'DM Sans', sans-serif; font-size:20px; font-weight:700; color:var(--navy); margin:32px 0 16px; border-left:4px solid var(--p); padding-left:16px; }
        
        /* Tables & Lists */
        table { width:100%; border-collapse:separate; border-spacing:0; margin-bottom:40px; border:1px solid var(--brd); border-radius:12px; overflow:hidden; }
        th { background:var(--bg); padding:18px; text-align:left; font-size:11px; font-weight:800; color:var(--slate); text-transform:uppercase; letter-spacing:1.5px; border-bottom:1px solid var(--brd); }
        td { padding:18px; border-bottom:1px solid var(--brd); vertical-align:top; background:#fff; font-size:14px; }
        tr:last-child td { border-bottom:none; }
        
        .bullet-list { list-style:none; padding-left:0; margin-bottom:32px; }
        .bullet-list li { position:relative; padding-left:28px; margin-bottom:14px; font-size:15px; color:#334155; }
        .bullet-list li::before { content:'→'; position:absolute; left:0; color:var(--p); font-weight:800; }

        .highlight-box { background:var(--navy); border-radius:24px; padding:50px; color:#fff; position:relative; overflow:hidden; margin-bottom:40px; }
        .highlight-box h3 { color:#fff; border-left-color:rgba(255,255,255,0.4); margin-top:0; }
        .highlight-box p { color:rgba(255,255,255,0.8); }

        .commercial-table td { font-weight:500; }
        .price-text { color:var(--p); font-weight:800; font-family:'DM Sans', sans-serif; font-size:16px; }
        
        .footer { padding:60px 100px; background:var(--bg); border-top:1px solid var(--brd); display:flex; justify-content:space-between; align-items:center; }
        .footer-logo { font-weight:800; font-size:14px; letter-spacing:1px; color:var(--navy); }
        .footer-meta { font-size:12px; color:var(--slate); font-weight:500; }

        @media print { .page { margin:0; box-shadow:none; border-radius:0; max-width:100%; } .no-print { display:none; } }
    </style>
</head>
<body>

<div class="page">
    <!-- COVER PAGE -->
    <div class="cover">
        <div class="cover-logo"><div class="logo-box">F</div><div class="logo-text">FRISTINE INFOTECH</div></div>
        <div class="cover-tag">Strategic Implementation Proposal</div>
        <h1>Enterprise Transformation: ${sol.title || 'Zoho Solution'}</h1>
        <div class="client-info">Prepared for ${cli.company}</div>
        <div class="meta-card">
            <div class="meta-item"><label>Reference ID</label><span>FRAI-${cli.company.substring(0,3).toUpperCase()}-${new Date().getFullYear()}</span></div>
            <div class="meta-item"><label>Date issued</label><span>${dateStr}</span></div>
            <div class="meta-item"><label>Architect</label><span>Fristine AI Architect (OG)</span></div>
            <div class="meta-item"><label>Classification</label><span>Strictly Confidential</span></div>
        </div>
    </div>

    <!-- 01 ABOUT FRISTINE -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">01</span><span class="sec-title">About <span>Fristine Infotech</span></span></div>
        <div class="highlight-box">
            <p>${sol.about_fristine || 'Fristine Infotech is a Premium Zoho Partner with over 9 years of experience. We serve 200+ global clients including Mercedes-Benz, TATA MD, and NPCI, specializing in complex enterprise transformations.'}</p>
        </div>
        <p>Our methodology combines technical rigor with business strategy, ensuring every implementation is not just a software deployment, but a platform for accelerated growth.</p>
    </div>

    <!-- 02 EXECUTIVE SUMMARY -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">02</span><span class="sec-title">Executive <span>Summary</span></span></div>
        ${fmt(sol.executive_summary)}
    </div>

    <!-- 03 CLIENT OBJECTIVE -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">03</span><span class="sec-title">Client <span>Objective</span></span></div>
        ${fmt(sol.client_objective)}
    </div>

    <!-- 04 PROPOSED SOLUTION -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">04</span><span class="sec-title">Proposed <span>Zoho Stack</span></span></div>
        ${fmt(sol.proposed_solution)}
    </div>

    <!-- 05 SCOPE OF WORK (SUMMARY) -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">05</span><span class="sec-title">Scope of <span>Work</span></span></div>
        ${fmt(sol.scope_of_work)}
    </div>

    <!-- 06 INTEGRATIONS -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">06</span><span class="sec-title">Enterprise <span>Integrations</span></span></div>
        <p>Strategic connectivity is core to this architecture. The following integrations are included:</p>
        <table>
            <thead><tr><th>Integration Module</th><th>Technical Method / Strategy</th></tr></thead>
            <tbody>
                ${(sol.integrations || []).map(i => `<tr><td><strong>${i.item}</strong></td><td>${i.detail}</td></tr>`).join('')}
            </tbody>
        </table>
    </div>

    <!-- 07 DATA MIGRATION -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">07</span><span class="sec-title">Data <span>Migration Strategy</span></span></div>
        ${fmt(sol.data_migration)}
    </div>

    <!-- 08 DELIVERY MODEL -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">08</span><span class="sec-title">Delivery <span>Model</span></span></div>
        ${fmt(sol.delivery_model)}
    </div>

    <!-- 09/10/11 TIMELINE & TEAM -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">09</span><span class="sec-title">Timeline & <span>Teams</span></span></div>
        <h3>Project Timeline</h3>
        <p>${sol.timeline || 'Implementation is expected to span 12-16 weeks across 4 major phases.'}</p>
        
        <h3>Project Team</h3>
        <p>${sol.project_team || 'A dedicated team consisting of a Lead Architect, Project Manager, and Technical Consultants will be assigned.'}</p>
        
        <h3>Governance</h3>
        <p>${sol.governance || 'Standard project governance includes weekly status calls, UAT sign-offs, and an escalation matrix reaching the Fristine Delivery Head.'}</p>
    </div>

    <!-- 12 DETAILED SOW -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">10</span><span class="sec-title">Detailed <span>Scope Mapping</span></span></div>
        <p>The following table outlines the granular module-level capabilities and defined boundaries for this implementation:</p>
        ${(sol.detailed_sow || []).map(m => `
            <h3>${m.module}</h3>
            <table>
                <thead><tr><th>Feature / Capability</th></tr></thead>
                <tbody>
                    ${(m.features || []).map(f => `<tr><td>${f}</td></tr>`).join('')}
                </tbody>
            </table>
        `).join('')}
    </div>

    <!-- 13/14 COMMERCIALS -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">11</span><span class="sec-title">Investment <span>Summary</span></span></div>
        <p>The total professional services fee for this transformation is detailed below:</p>
        <table class="commercial-table">
            <thead><tr><th>Description</th><th>Billing Model</th><th>Investment (INR)</th></tr></thead>
            <tbody>
                ${(sol.commercials || []).map(c => `<tr><td>${c.service}</td><td>${c.model}</td><td class="price-text" contenteditable="true">${c.cost}</td></tr>`).join('')}
                <tr style="background:var(--bg)"><td colspan="2"><strong>Total Implementation Estimate</strong></td><td class="price-text" contenteditable="true">₹ (Quoted)</td></tr>
            </tbody>
        </table>
        
        <h3>Payment Terms</h3>
        <p>${sol.payment_terms || '60% Advance Payment | 40% Completion of UAT sign-off.'}</p>
    </div>

    <!-- 15/16 ASSUMPTIONS & RUN MODEL -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">12</span><span class="sec-title">Assumptions & <span>Run Model</span></span></div>
        <h3>Project Assumptions</h3>
        <ul class="bullet-list">
            ${(sol.assumptions_constraints || ["Client will provide timely access to data sources.", "Third-party API credentials must be shared by client."]).map(a => `<li>${a}</li>`).join('')}
        </ul>
        
        <div class="highlight-box">
            <h3>Managed Services (Managed Run)</h3>
            <p>${sol.run_model || 'Post-implementation, we offer a dedicated Managed Services model for ongoing optimizations, L3 support, and quarterly platform audits.'}</p>
        </div>
    </div>

    <!-- 17 ANNEXURE -->
    <div class="section">
        <div class="sec-head"><span class="sec-num">13</span><span class="sec-title">Project <span>Annexure</span></span></div>
        ${fmt(sol.annexure || 'Additional technical specifications and API documentation will be provided in the Master Design Document (MDD) during Phase 1.')}
        
        <div style="margin-top:100px; display:grid; grid-template-columns:1fr 1fr; gap:60px">
            <div style="border-top:1px solid #000; padding-top:12px"><p style="font-size:11px; font-weight:800">FOR FRISTINE INFOTECH PVT LTD</p></div>
            <div style="border-top:1px solid #000; padding-top:12px"><p style="font-size:11px; font-weight:800">FOR ${cli.company.toUpperCase()}</p></div>
        </div>
    </div>

    <div class="footer">
        <div class="footer-logo">FRISTINE INFOTECH · ZOHO PREMIUM PARTNER</div>
        <div class="footer-meta">Confidential © ${new Date().getFullYear()} · Generated by Fristine AI Architect</div>
    </div>
</div>

</body>
</html>`;

    if (activeClientId) {
        try { 
            console.log('[Proposal] Saving version for:', activeClientId);
            await proposals.save(activeClientId, html, `Enterprise Proposal — ${cli.company}`); 
            console.log('[Proposal] Save SUCCESS');
        } catch (err) {
            console.error('[Proposal] Save FAILED:', err);
        }
        try { await tracking.logEvent(activeClientId, 'proposal_generated'); } catch {}
    }

    pendingBlob = new Blob([html], { type: 'text/html' });
    pendingName = fname;
    hideLdr();

    addAg(`
        <div class="reqcard-box" style="text-align:center;padding:28px 20px;">
            <div style="margin-bottom:14px"><svg viewBox="0 0 48 48" width="48" height="48" fill="none"><circle cx="24" cy="24" r="20" stroke="var(--green)" stroke-width="2.5"/><path d="M15 24l6 6 12-12" stroke="var(--green)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
            <div style="font-size:17px;font-weight:700;margin-bottom:10px">Enterprise Solution Architected</div>
            <div style="font-size:13px;color:var(--sub);line-height:1.75;max-width:400px;margin:0 auto">
                An enterprise-grade, boardroom-ready proposal has been generated following the Fristine Proposal Intelligence protocol.<br/><br/>
                <strong>You can now view, download, or edit the technical specifications. The solution includes all 17 mandatory sections and module-level boundaries.</strong>
            </div>
        </div>`, { noEscape: true });
    
    // Sync sidebar to final stage
    setStg(4, 'done'); setPhase('Proposal Generated');
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

/* ══ CORE UI NAVIGATION ══ */
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
document.getElementById('staffLogout').addEventListener('click', () => { 
    localStorage.removeItem('f_active_agent'); 
    window.location.href = window.location.pathname + '?loggedout=true'; 
});
document.getElementById('logoutBtn').addEventListener('click', () => { 
    window.location.href = window.location.pathname + '?exit=true'; 
});
document.getElementById('trackLogout').addEventListener('click', () => { 
    localStorage.removeItem('f_active_agent'); 
    window.location.href = window.location.pathname + '?loggedout=true'; 
});
document.getElementById('backToDashBtn').addEventListener('click', () => { 
    const timeline = gsap.timeline();
    timeline.to('#T', { opacity: 0, x: 20, duration: 0.3, onComplete: () => hide('T') });
    timeline.fromTo('#H', { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.3, onStart: () => show('H') });
    renderClientTable(); 
});

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
    gsap.fromTo(l, { opacity: 0, backdropFilter: 'blur(0px)' }, { opacity: 1, backdropFilter: 'blur(20px)', duration: 0.4, ease: 'power2.out' });
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

function mdToHtml(md) {
    if (!md) return '';
    let h = md.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>');
    h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.*?)\*/g, '<em>$1</em>');
    h = h.replace(/^- (.*?)$/gm, '<li>$1</li>');
    h = h.replace(/(<li>.*?<\/li>)/g, '<ul>$1</ul>');
    h = h.replace(/<\/ul>\s*<ul>/g, ''); 
    return h;
}

function addAg(msg, opts = {}) {
    // Use global voice if enabled or in calling mode
    if ((callingMode || voiceEnabled) && !opts.restored) {
        playVoice(msg);
    }
    
    // Always render to feed for visual confirmation, unless hidden via options
    const f = document.getElementById('feed');
    if (!f) return;
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
}


async function playVoice(text) {
    if (!text || (!callingMode && !voiceEnabled)) return;
    // Strip HTML and Markdown for cleaner TTS
    const cleanText = text.replace(/<[^>]*>/g, '')
                          .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
                          .replace(/\*(.+?)\*/g, '$1')   // Italic
                          .replace(/#+\s/g, '')          // Headings
                          .replace(/[-*+]\s/g, '')        // Bullets
                          .replace(/`{1,3}.*?`{1,3}/gs, '') // Code blocks
                          .replace(/\[(.+?)\]\(.*?\)/g, '$1') // Links
                          .replace(/\*\*|__|#|`|\[|\]|\(|\)/g, '')
                          .replace(/&[a-z0-9#]+;/gi, ' ')
                          .replace(/\s+/g, ' ')
                          .trim();
    
    if (!cleanText || cleanText.length < 2) return;
    
    console.log('[Voice] Pre-queueing speech:', cleanText.substring(0, 40) + '...');
    voiceQueue.push(cleanText);
    if (!isProcessingVoice) processVoiceQueue();
}

async function processVoiceQueue() {
    // Exit Guard: Stop processing if the session was closed
    if (!callingMode && !voiceEnabled) {
        voiceQueue = [];
        isProcessingVoice = false;
        return;
    }

    if (voiceQueue.length === 0) {
        isProcessingVoice = false;
        console.log('[Voice] Queue empty.');
        return;
    }
    isProcessingVoice = true;
    const text = voiceQueue.shift();

    console.log('[Voice] Processing item:', text.substring(0, 30));

    try {
        if (currentAudioSource) {
            try { currentAudioSource.stop(); } catch(e){}
            currentAudioSource = null;
        }

        const data = await voice.speak(text);
        if (!data || !data.audio) {
            console.warn('[Voice] No audio data returned from backend.');
            // Wait 2 seconds on service failure to avoid rapid-fire loops
            return setTimeout(processVoiceQueue, 2000);
        }

        console.log('[Voice] Decoding audio data:', data.audio.length, 'bytes');
        const audioData = atob(data.audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) view[i] = audioData.charCodeAt(i);
        
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            console.warn('[Voice] AudioContext suspended. Attempting resume...');
            // Safety timeout for resume
            await Promise.race([
                audioContext.resume(),
                new Promise(r => setTimeout(r, 1000))
            ]);
        }
        
        let buffer;
        try {
            buffer = await audioContext.decodeAudioData(arrayBuffer);
        } catch (decodeErr) {
            console.error('[Voice] Decoding failed:', decodeErr);
            return setTimeout(processVoiceQueue, 500);
        }
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);

        if (currentAudioSource) {
            try { currentAudioSource.stop(); } catch(e){}
        }
        currentAudioSource = source;

        const waves = document.querySelectorAll('.voice-wave, .large-voice-wave');
        waves.forEach(w => w.classList.add('active'));

        source.onended = () => {
            console.log('[Voice] Playback ended.');
            if (currentAudioSource === source) {
                currentAudioSource = null;
                waves.forEach(w => w.classList.remove('active'));
            }
            // Small delay to prevent tight-looping on short/empty segments
            setTimeout(processVoiceQueue, 10); 
        };
        
        console.log('[Voice] Starting playback...');
        source.start(0);
    } catch (e) {
        console.error('[Voice Error Callback]', e);
        // CRITICAL: If the service is failing (e.g. 401), WAIT 2 seconds 
        // to prevent an infinite recursive loop that hangs the UI.
        setTimeout(processVoiceQueue, 2000);
    }
}

function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function addUs(msg) {
    const f = document.getElementById('feed');
    if (!f) return;
    const d = document.createElement('div');
    d.className = 'msg u';
    // Always render bubble even in calling mode for visual tracking
    d.innerHTML = `<div class="msg-av">U</div><div class="msg-bubble">${escHtml(msg)}</div>`;
    f.appendChild(d);
    f.scrollTop = f.scrollHeight;
    saveConversationMemory();
}

function showToast(message, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast-notification ${type}`;
    // Truncate long error messages for UI comfort
    const displayMsg = message.length > 120 ? message.substring(0, 117) + '...' : message;
    
    const icon = type === 'success'
        ? '<svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 8l3 3 5-5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        : '<svg viewBox="0 0 16 16" width="16" height="16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/></svg>';
    t.innerHTML = icon + displayMsg;
    document.body.appendChild(t);
    setTimeout(() => {
        t.classList.add('exiting');
        setTimeout(() => t.remove(), 300);
    }, type === 'success' ? 3000 : 7000); // Errors stay longer
}

function evaluateDiscoveryCompleteness(transcript) {
    const t = transcript.toLowerCase();
    if (t.includes('kpi') || t.includes('metric') || t.includes('revenue')) discoveryProgress.metrics = true;
    if (t.includes('buy') || t.includes('sign off') || t.includes('budget')) discoveryProgress.economicBuyer = true;
    if (t.includes('pain') || t.includes('challenge') || t.includes('issue')) discoveryProgress.pain = true;
    if (t.includes('champion') || t.includes('involved') || t.includes('team')) discoveryProgress.champion = true;
    if (t.includes('when') || t.includes('timeline') || t.includes('ready')) discoveryProgress.timeline = true;
    
    updateDiscoveryUI();
}

function updateDiscoveryUI() {
    const items = Object.values(discoveryProgress).filter(Boolean).length;
    const pct = (items / 5) * 100;
    const cvb = document.getElementById('cvb');
    const cvp = document.getElementById('cvp');
    if (cvb) cvb.style.width = pct + '%';
    if (cvp) cvp.textContent = Math.round(pct) + '%';
    
    if (items >= 4 && !discoveryComplete) {
        console.log('[Discovery] Strategic criteria met.');
    }
}

/* ══ MOBILE UI HELPERS ══ */
function initMobileMenu() {
    const toggleA = document.getElementById('menuToggleA');
    const toggleH = document.getElementById('menuToggleH');
    const side = document.getElementById('sidebar');

    const toggle = () => side?.classList.toggle('open');

    if (toggleA) toggleA.onclick = toggle;
    if (toggleH) toggleH.onclick = toggle;

    // Close menu when clicking outside (on the chat panel)
    document.querySelector('.chat-panel')?.addEventListener('click', () => {
        if (side?.classList.contains('open')) side.classList.remove('open');
    });
}

/* ══ BOOT ══ */
init();
