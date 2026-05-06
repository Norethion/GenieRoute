const express = require('express');
const axios = require('axios');
const router = express.Router();
const placesService = require('../services/placesService');

// POST /api/places/search - Şehre göre mekan ara
router.post('/search', async (req, res, next) => {
  try {
    const { city, interests, language } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'city is required' });
    }

    const lang = ['tr', 'en'].includes(language) ? language : 'en';
    const places = await placesService.searchPlaces(city, interests || [], lang);
    res.json({ places });
  } catch (err) {
    next(err);
  }
});

// POST /api/places/restaurants - Şehre göre restoran ara
router.post('/restaurants', async (req, res, next) => {
  try {
    const { city, budget, language } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'city is required' });
    }

    const lang = ['tr', 'en'].includes(language) ? language : 'en';
    const restaurants = await placesService.searchRestaurants(city, budget, lang);
    res.json({ restaurants });
  } catch (err) {
    next(err);
  }
});

// POST /api/places/lookup - Tek mekan ismi + şehir → koordinat ve detay
router.post('/lookup', async (req, res, next) => {
  try {
    const { name, city, language } = req.body;
    if (!name || !city) {
      return res.status(400).json({ error: 'name and city are required' });
    }
    const place = await placesService.lookupPlace(name, city, language || 'en');
    if (!place) return res.status(404).json({ error: 'Place not found' });
    res.json({ place });
  } catch (err) {
    next(err);
  }
});

// GET /api/places/photo/:ref - Photo proxy (hides API key)
router.get('/photo/:ref', async (req, res, next) => {
  try {
    const photoRef = req.params.ref;
    const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${photoRef}&key=${process.env.GOOGLE_PLACES_API_KEY}`;
    const response = await axios.get(url, { responseType: 'stream' });
    res.set('Content-Type', response.headers['content-type']);
    res.set('Cache-Control', 'public, max-age=86400');
    response.data.pipe(res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
