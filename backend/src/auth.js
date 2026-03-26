const router = require('express').Router();
const store  = require('../middleware/store');

/* GET /api/auth/check?email=… — check if password is set for this agent */
router.get('/check', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email required' });
  if (!email.toLowerCase().endsWith('@fristinetech.com')) {
    return res.status(403).json({ error: 'Access restricted to @fristinetech.com accounts' });
  }
  const agents = store.read('agents.json', {});
  const hasPassword = !!agents[email.toLowerCase()]?.password;
  res.json({ hasPassword, email: email.toLowerCase() });
});

/* POST /api/auth/login — verify password */
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (!email.toLowerCase().endsWith('@fristinetech.com')) {
    return res.status(403).json({ error: 'Access restricted to @fristinetech.com accounts' });
  }

  const agents = store.read('agents.json', {});
  const agent  = agents[email.toLowerCase()];

  if (!agent || !agent.password) {
    return res.status(401).json({ error: 'NO_PASSWORD', message: 'No password set for this account — please set one.' });
  }
  if (agent.password !== password) {
    return res.status(401).json({ error: 'WRONG_PASSWORD', message: 'Incorrect password.' });
  }

  res.json({ success: true, email: email.toLowerCase(), name: agent.name || email.split('@')[0] });
});

/* POST /api/auth/set-password — first time setup or reset */
router.post('/set-password', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!email.toLowerCase().endsWith('@fristinetech.com')) {
    return res.status(403).json({ error: 'Access restricted to @fristinetech.com accounts' });
  }

  const agents = store.read('agents.json', {});
  const key    = email.toLowerCase();
  agents[key]  = { ...(agents[key] || {}), password, email: key, updatedAt: new Date().toISOString() };
  store.write('agents.json', agents);

  res.json({ success: true });
});

module.exports = router;
