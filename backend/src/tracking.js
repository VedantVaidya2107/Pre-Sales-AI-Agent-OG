const router = require('express').Router();
const store  = require('../middleware/store');

const VALID_EVENTS = [
  'bot_sent', 'bot_accessed', 'conversation_started',
  'proposal_generated', 'proposal_submitted', 'proposal_sent'
];

/* GET /api/tracking/:clientId — get all events for a client */
router.get('/:clientId', (req, res) => {
  const events    = store.read('events.json', {});
  const clientEvs = events[req.params.clientId] || [];
  res.json(clientEvs);
});

/* POST /api/tracking/:clientId — log a new event */
router.post('/:clientId', (req, res) => {
  const { event, note } = req.body;
  if (!event) return res.status(400).json({ error: 'event is required' });

  const events    = store.read('events.json', {});
  const clientId  = req.params.clientId;
  if (!events[clientId]) events[clientId] = [];

  // De-duplicate: only one entry per event type
  const existing = events[clientId].find(e => e.event === event);
  if (!existing) {
    events[clientId].push({
      client_id: clientId,
      event,
      note: note || null,
      timestamp: new Date().toISOString(),
    });
    store.write('events.json', events);
  }

  res.json({ success: true, events: events[clientId] });
});

/* DELETE /api/tracking/:clientId — clear all events for a client */
router.delete('/:clientId', (req, res) => {
  const events = store.read('events.json', {});
  delete events[req.params.clientId];
  store.write('events.json', events);
  res.json({ success: true });
});

module.exports = router;
