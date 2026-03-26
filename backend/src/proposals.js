const router = require('express').Router();
const store  = require('../middleware/store');

/* GET /api/proposals/:clientId — fetch proposal HTML */
router.get('/:clientId', (req, res) => {
  const proposals = store.read('proposals.json', {});
  const p         = proposals[req.params.clientId];
  if (!p) return res.status(404).json({ error: 'Proposal not found' });
  res.json(p);
});

/* POST /api/proposals/:clientId — save proposal HTML */
router.post('/:clientId', (req, res) => {
  const { proposal_html, title } = req.body;
  if (!proposal_html) return res.status(400).json({ error: 'proposal_html is required' });

  const proposals = store.read('proposals.json', {});
  proposals[req.params.clientId] = {
    client_id: req.params.clientId,
    proposal_html,
    title: title || `Zoho Proposal — ${req.params.clientId}`,
    savedAt: new Date().toISOString(),
  };
  store.write('proposals.json', proposals);
  res.json({ success: true });
});

/* PUT /api/proposals/:clientId — update (overwrite) */
router.put('/:clientId', (req, res) => {
  const { proposal_html } = req.body;
  if (!proposal_html) return res.status(400).json({ error: 'proposal_html is required' });

  const proposals = store.read('proposals.json', {});
  if (!proposals[req.params.clientId]) return res.status(404).json({ error: 'Proposal not found' });

  proposals[req.params.clientId] = {
    ...proposals[req.params.clientId],
    proposal_html,
    updatedAt: new Date().toISOString(),
  };
  store.write('proposals.json', proposals);
  res.json({ success: true });
});

module.exports = router;
