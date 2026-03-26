const router = require('express').Router();
const store  = require('../middleware/store');
const { v4: uuid } = require('uuid');

function generateClientId(clients) {
  const existing = clients
    .map(c => c.client_id || '')
    .filter(id => /^FRIST\d{3,}$/.test(id))
    .map(id => parseInt(id.replace('FRIST', ''), 10))
    .filter(n => !isNaN(n));
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
  return 'FRIST' + String(next).padStart(3, '0');
}

/* GET /api/clients — list all */
router.get('/', (req, res) => {
  const clients = store.read('clients.json', []);
  res.json(clients);
});

/* GET /api/clients/next-id — get the next available client ID */
router.get('/next-id', (req, res) => {
  const clients = store.read('clients.json', []);
  res.json({ next_id: generateClientId(clients) });
});

/* GET /api/clients/:id — single client */
router.get('/:id', (req, res) => {
  const clients = store.read('clients.json', []);
  const client  = clients.find(c => c.client_id?.toLowerCase() === req.params.id.toLowerCase());
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

/* POST /api/clients — create */
router.post('/', (req, res) => {
  const { company, industry, email, notes, size } = req.body;
  if (!company || !email) return res.status(400).json({ error: 'company and email required' });

  const clients   = store.read('clients.json', []);
  const client_id = generateClientId(clients);
  const newClient = {
    client_id,
    company: company.trim(),
    industry: industry?.trim() || '',
    email: email.trim(),
    notes: notes?.trim() || '',
    size: size?.trim() || '',
    createdAt: new Date().toISOString(),
  };
  clients.push(newClient);
  store.write('clients.json', clients);

  res.status(201).json(newClient);
});

/* PUT /api/clients/:id — update */
router.put('/:id', (req, res) => {
  const clients = store.read('clients.json', []);
  const idx     = clients.findIndex(c => c.client_id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Client not found' });

  clients[idx] = { ...clients[idx], ...req.body, client_id: req.params.id };
  store.write('clients.json', clients);
  res.json(clients[idx]);
});

/* DELETE /api/clients/:id — delete */
router.delete('/:id', (req, res) => {
  let clients = store.read('clients.json', []);
  const before = clients.length;
  clients      = clients.filter(c => c.client_id !== req.params.id);
  if (clients.length === before) return res.status(404).json({ error: 'Client not found' });
  store.write('clients.json', clients);
  res.json({ success: true });
});

module.exports = router;
