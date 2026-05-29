const express = require('express');
const router = express.Router();
const favoritesModel = require('../models/favoritesModel');

function validClientUuid(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\n\r]/.test(value);
}

// POST /api/favorites - Favori ekle/güncelle
router.post('/', async (req, res, next) => {
  try {
    const { clientUuid, placeId, name, category, city, lat, lng, rating } = req.body;

    if (!validClientUuid(clientUuid)) {
      return res.status(400).json({ error: 'Invalid clientUuid' });
    }
    if (typeof placeId !== 'string' || placeId.length === 0 || placeId.length > 200) {
      return res.status(400).json({ error: 'Invalid placeId' });
    }
    if (typeof name !== 'string' || name.length === 0 || name.length > 300) {
      return res.status(400).json({ error: 'Invalid name' });
    }
    if (lat != null && !Number.isFinite(Number(lat))) {
      return res.status(400).json({ error: 'Invalid lat' });
    }
    if (lng != null && !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: 'Invalid lng' });
    }
    if (rating != null && (!Number.isFinite(Number(rating)) || rating < 0 || rating > 5)) {
      return res.status(400).json({ error: 'Invalid rating' });
    }

    const favorite = await favoritesModel.addFavorite({
      clientUuid, placeId, name,
      category: typeof category === 'string' ? category.slice(0, 60) : null,
      city: typeof city === 'string' ? city.slice(0, 120) : null,
      lat: lat != null ? Number(lat) : null,
      lng: lng != null ? Number(lng) : null,
      rating: rating != null ? Number(rating) : null,
    });
    res.status(201).json({ favorite });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/favorites/:placeId?clientUuid= - Favori sil
router.delete('/:placeId', async (req, res, next) => {
  try {
    const { clientUuid } = req.query;
    const { placeId } = req.params;
    if (!validClientUuid(clientUuid)) {
      return res.status(400).json({ error: 'Invalid clientUuid' });
    }
    if (!placeId) {
      return res.status(400).json({ error: 'Invalid placeId' });
    }
    const removed = await favoritesModel.removeFavorite({ clientUuid, placeId });
    if (!removed) return res.status(404).json({ error: 'Favorite not found' });
    res.json({ removed: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/favorites?clientUuid= - Favori listesi
router.get('/', async (req, res, next) => {
  try {
    const { clientUuid } = req.query;
    if (!validClientUuid(clientUuid)) {
      return res.status(400).json({ error: 'Invalid clientUuid' });
    }
    const favorites = await favoritesModel.listFavorites(clientUuid);
    res.json({ favorites });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
