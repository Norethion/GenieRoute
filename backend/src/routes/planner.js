const express = require('express');
const router = express.Router();
const placesService = require('../services/placesService');
const filterService = require('../services/filterService');
const llmService = require('../services/llmService');
const budgetService = require('../services/budgetService');
const cityTips = require('../data/cityTips.json');
const routeOptimizer = require('../services/routeOptimizer');
const weatherService = require('../services/weatherService');

// Şehir yarıçapı (km): geocode viewport köşegeni / 2, "şehir merkezi" hissi için ölçeklenir.
// Viewport yoksa null döner; optimizeRoute sabit bir çap sınırına geri düşer.
function computeCityRadiusKm(cityGeo) {
  const v = cityGeo?.viewport;
  if (!v?.northeast || !v?.southwest) return null;
  const diagKm = routeOptimizer.haversine(
    v.northeast.lat, v.northeast.lng,
    v.southwest.lat, v.southwest.lng
  );
  return (diagKm / 2) * 0.7;
}

function validatePlanInput(body) {
  const { city, days, budget, interests } = body;

  if (!city || !days || !budget || !interests) {
    return 'city, days, budget, and interests are required';
  }
  if (typeof city !== 'string' || city.length > 100 || /[\n\r]/.test(city)) {
    return 'Invalid city parameter';
  }
  const daysNum = Number(days);
  if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 14) {
    return 'days must be between 1 and 14';
  }
  if (!['low', 'medium', 'high'].includes(budget)) {
    return 'budget must be low, medium, or high';
  }
  if (!Array.isArray(interests) || interests.length === 0 || interests.length > 8) {
    return 'interests must be an array with 1-8 items';
  }
  return null;
}

function resolveLanguage(language) {
  return ['tr', 'en'].includes(language) ? language : 'en';
}

// POST /api/planner/generate - Tam rota üretimi (tek çağrıda)
router.post('/generate', async (req, res, next) => {
  try {
    const err = validatePlanInput(req.body);
    if (err) return res.status(400).json({ error: err });

    const { city, days, budget, interests, language, startDate, endDate } = req.body;
    const lang = resolveLanguage(language);
    const daysNum = Number(days);

    // 1. Google Places API'den mekan, restoran ve şehir geocode'unu çek
    const [rawPlaces, rawRestaurants, cityGeo] = await Promise.all([
      placesService.searchPlaces(city, interests, lang),
      placesService.searchRestaurants(city, budget, lang),
      placesService.geocodeCity(city),
    ]);

    // 2. Filtreleme
    const places = filterService.filterPlaces(rawPlaces, { days: daysNum });
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: daysNum });

    // 3. Rota optimizasyonu (şehir büyüklüğüne göre dinamik gün-içi çap sınırı)
    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const { optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(places, restaurants, daysNum, cityRadiusKm);

    // 4. LLM ile günlük plan üret
    const dailyPlan = await llmService.generateDailyPlan({
      city, days: daysNum, budget, interests,
      places, restaurants, language: lang,
      optimizedPlaces, optimizedRestaurants,
      maxDailyDiameterKm,
    });

    // 5. Harita marker'ları
    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    // 6. Bütçe
    const budgetEstimate = await budgetService.calculateBudget({ city, days: daysNum, budget });

    // 7. Şehir ipuçları
    const tips = cityTips[budgetEstimate.city] || cityTips.default;
    const cityInfo = { tr: tips.tr, en: tips.en };

    // 8. Hava durumu (cityGeo'yu yeniden kullan)
    let weather = null;
    if (startDate && endDate && cityGeo) {
      weather = await weatherService.getWeatherForecast(cityGeo.lat, cityGeo.lng, startDate, endDate);
    }

    res.json({
      trip: { city, days, budget, interests, startDate, endDate },
      language: lang,
      dailyPlan,
      places, restaurants, mapMarkers,
      budgetEstimate, cityInfo, weather,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/planner/prepare - Adım 2: filter + optimize + budget + tips + weather
router.post('/prepare', async (req, res, next) => {
  try {
    const err = validatePlanInput(req.body);
    if (err) return res.status(400).json({ error: err });

    const { city, days, budget, language, startDate, endDate, rawPlaces, rawRestaurants } = req.body;

    if (!Array.isArray(rawPlaces) || !Array.isArray(rawRestaurants)) {
      return res.status(400).json({ error: 'rawPlaces and rawRestaurants must be arrays' });
    }

    const lang = resolveLanguage(language);
    const daysNum = Number(days);

    const places = filterService.filterPlaces(rawPlaces, { days: daysNum });
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: daysNum });

    // Şehir geocode + dinamik gün-içi çap sınırı
    const cityGeo = await placesService.geocodeCity(city);
    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const { optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(places, restaurants, daysNum, cityRadiusKm);

    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    const budgetEstimate = await budgetService.calculateBudget({ city, days: daysNum, budget });
    const tips = cityTips[budgetEstimate.city] || cityTips.default;
    const cityInfo = { tr: tips.tr, en: tips.en };

    let weather = null;
    if (startDate && endDate && cityGeo) {
      weather = await weatherService.getWeatherForecast(cityGeo.lat, cityGeo.lng, startDate, endDate);
    }

    res.json({
      language: lang,
      places, restaurants,
      optimizedPlaces, optimizedRestaurants,
      maxDailyDiameterKm,
      mapMarkers, budgetEstimate, cityInfo, weather,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/planner/llm - Adım 3: yalnızca LLM ile günlük plan
router.post('/llm', async (req, res, next) => {
  try {
    const err = validatePlanInput(req.body);
    if (err) return res.status(400).json({ error: err });

    const { city, days, budget, interests, language, places, restaurants, optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm } = req.body;

    if (!Array.isArray(places) || !Array.isArray(restaurants)) {
      return res.status(400).json({ error: 'places and restaurants must be arrays' });
    }

    const lang = resolveLanguage(language);
    const daysNum = Number(days);

    const dailyPlan = await llmService.generateDailyPlan({
      city, days: daysNum, budget, interests,
      places, restaurants, language: lang,
      optimizedPlaces, optimizedRestaurants,
      maxDailyDiameterKm,
    });

    res.json({ dailyPlan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
