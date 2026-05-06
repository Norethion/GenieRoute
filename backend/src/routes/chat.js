const express = require('express');
const router = express.Router();
const chatModel = require('../models/chatModel');

// GET /api/chats/sessions/:tripId?clientUuid=X — Trip için chat history yükle
router.get('/sessions/:tripId', async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) return res.status(400).json({ error: 'Invalid trip id' });

    const { clientUuid, language } = req.query;
    const session = await chatModel.getOrCreateSession({
      tripId,
      clientUuid: clientUuid || null,
      language: language || 'en',
    });
    const messages = await chatModel.getRecentMessages(session.id);
    res.json({ session, messages });
  } catch (err) {
    next(err);
  }
});

// GET /api/chats/sessions/:tripId/updates — Trip için tüm uygulanmış değişiklikler
router.get('/sessions/:tripId/updates', async (req, res, next) => {
  try {
    const tripId = parseInt(req.params.tripId, 10);
    if (isNaN(tripId)) return res.status(400).json({ error: 'Invalid trip id' });
    const updates = await chatModel.getPlanUpdatesForTrip(tripId);
    res.json({ updates });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
