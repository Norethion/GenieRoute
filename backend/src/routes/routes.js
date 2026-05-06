const express = require('express');
const router = express.Router();
const cultureRoutes = require('../data/cultureRoutes.json');

// GET /api/routes/featured - Featured culture routes
router.get('/featured', (_req, res) => {
  res.json({ routes: cultureRoutes });
});

// GET /api/routes/:slug - Single route detail
router.get('/:slug', (req, res) => {
  const route = cultureRoutes.find((r) => r.slug === req.params.slug);
  if (!route) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.json({ route });
});

module.exports = router;
