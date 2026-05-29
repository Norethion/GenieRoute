const express = require('express');
const router = express.Router();
const preferencesModel = require('../models/preferencesModel');

function validClientUuid(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\n\r]/.test(value);
}

// prefs içindeki bilinen alanlar. Array alanları sanitize edilir; tekil alanlar
// allow-list ile sınırlanır. Bilinmeyen anahtarlar düşürülür (route'ta whitelist).
const ARRAY_FIELDS = [
  'travelStyle', 'favoriteCategories', 'cuisines', 'dietary',
  'accessibility', 'accommodation', 'transport', 'languages',
];
const SCALAR_ALLOW = {
  dailyBudget: ['low', 'medium', 'high'],
  activityLevel: ['relaxed', 'normal', 'intensive'],
  tripPace: ['relaxed', 'normal', 'intensive'],
};

function sanitizePrefs(prefs) {
  const out = {};
  for (const field of ARRAY_FIELDS) {
    const v = prefs[field];
    if (Array.isArray(v)) {
      out[field] = v
        .filter((x) => typeof x === 'string' && x.length <= 60)
        .slice(0, 20);
    }
  }
  for (const [field, allowed] of Object.entries(SCALAR_ALLOW)) {
    const v = prefs[field];
    if (typeof v === 'string' && allowed.includes(v)) out[field] = v;
  }
  return out;
}

// GET /api/preferences?clientUuid=
router.get('/', async (req, res, next) => {
  try {
    const { clientUuid } = req.query;
    if (!validClientUuid(clientUuid)) {
      return res.status(400).json({ error: 'Invalid clientUuid' });
    }
    const preferences = await preferencesModel.getPreferences(clientUuid);
    res.json({ preferences: preferences ?? {} });
  } catch (err) {
    next(err);
  }
});

// PUT /api/preferences
router.put('/', async (req, res, next) => {
  try {
    const { clientUuid, prefs } = req.body;
    if (!validClientUuid(clientUuid)) {
      return res.status(400).json({ error: 'Invalid clientUuid' });
    }
    if (prefs == null || typeof prefs !== 'object' || Array.isArray(prefs)) {
      return res.status(400).json({ error: 'prefs must be an object' });
    }
    const sanitized = sanitizePrefs(prefs);
    const saved = await preferencesModel.upsertPreferences(clientUuid, sanitized);
    res.json({ preferences: saved });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
