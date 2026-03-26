require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const clientsRouter   = require('./routes/clients');
const trackingRouter  = require('./routes/tracking');
const proposalsRouter = require('./routes/proposals');
const emailRouter     = require('./routes/email');
const authRouter      = require('./routes/auth');
const geminiRouter    = require('./routes/gemini');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ─── Middleware ─── */
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:5174',
    'http://localhost:5175',
    /\.github\.io$/,
  ],
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

/* ─── Health ─── */
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

/* ─── Routes ─── */
app.use('/api/auth',      authRouter);
app.use('/api/clients',   clientsRouter);
app.use('/api/tracking',  trackingRouter);
app.use('/api/proposals', proposalsRouter);
app.use('/api/email',     emailRouter);
app.use('/api/gemini',    geminiRouter);

/* ─── Start ─── */
app.listen(PORT, () => {
  console.log(`\n🚀  Fristine Presales Backend running on http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
