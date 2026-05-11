const express = require('express');
const router = express.Router();
const placesService = require('../services/placesService');
const filterService = require('../services/filterService');
const llmService = require('../services/llmService');
const budgetService = require('../services/budgetService');
const cityDataService = require('../services/cityDataService');
const mustSeeService = require('../services/mustSeeService');
const defaultTips = require('../data/defaultTips.json');
const countryInfo = require('../data/countryInfo.json');
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

const VALID_INTENSITY = ['relaxed', 'normal', 'intensive'];
const VALID_TRANSPORT = ['walking', 'transit', 'car', 'mixed'];

function validatePlanInput(body) {
  const { city, days, budget, interests, intensity, transportMode } = body;

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
  if (intensity != null && !VALID_INTENSITY.includes(intensity)) {
    return `intensity must be one of: ${VALID_INTENSITY.join(', ')}`;
  }
  if (transportMode != null && !VALID_TRANSPORT.includes(transportMode)) {
    return `transportMode must be one of: ${VALID_TRANSPORT.join(', ')}`;
  }
  return null;
}

function resolvePreferences(body) {
  return {
    intensity: VALID_INTENSITY.includes(body.intensity) ? body.intensity : 'normal',
    transportMode: VALID_TRANSPORT.includes(body.transportMode) ? body.transportMode : 'mixed',
  };
}

function resolveLanguage(language) {
  return ['tr', 'en'].includes(language) ? language : 'en';
}

// Tüm şehirler LLM ensemble + cache yolundan geçer; LLM hata verirse generic
// default ipuçları döner.
async function resolveCityTips({ city, countryCode }) {
  const country = countryCode ? countryInfo[countryCode] : null;
  const countryName = country?.name || countryCode || 'Unknown';

  try {
    const { merged } = await cityDataService.getTipsForCity({
      cityName: city,
      countryCode,
      countryName,
    });
    return { tr: merged?.tr || defaultTips.tr, en: merged?.en || defaultTips.en };
  } catch (err) {
    console.error('[planner] tips LLM failed, using default:', err.message);
    return { tr: defaultTips.tr, en: defaultTips.en };
  }
}

function resolveCountryName(countryCode) {
  if (!countryCode) return null;
  return countryInfo[countryCode]?.name || null;
}

// POST /api/planner/generate - Tam rota üretimi (tek çağrıda)
router.post('/generate', async (req, res, next) => {
  try {
    const err = validatePlanInput(req.body);
    if (err) return res.status(400).json({ error: err });

    const { city, days, budget, interests, language, startDate, endDate } = req.body;
    const { intensity, transportMode } = resolvePreferences(req.body);
    const lang = resolveLanguage(language);
    const daysNum = Number(days);

    const [rawPlaces, rawRestaurants, cityGeo] = await Promise.all([
      placesService.searchPlaces(city, interests, lang),
      placesService.searchRestaurants(city, budget, lang),
      placesService.geocodeCity(city, lang),
    ]);

    const countryCode = cityGeo?.countryCode || null;
    const countryName = resolveCountryName(countryCode);

    // Must-see / curated kategorileri: LLM-curated isim listesi + Places lookup
    // ile koordinatlandırılmış yerler. rawPlaces (Google search çıktısı)
    // mega-popüler yerleri her zaman ilk sıralara getirmediği için iconic
    // havuzunu burada zenginleştiriyoruz; placeId ile dedup.
    const [mustSee, mustSeeEnriched] = await Promise.all([
      mustSeeService.getMustSeeForCity({ cityName: city, countryCode, countryName }).catch((err) => {
        console.error('[planner] mustSee list failed:', err.message);
        return { iconic: [], curated: [] };
      }),
      mustSeeService.getMustSeePlacesEnriched({ cityName: city, countryCode, countryName, language: lang }).catch((err) => {
        console.error('[planner] mustSee enrich failed:', err.message);
        return [];
      }),
    ]);

    const seenIds = new Set(rawPlaces.map((p) => p.placeId).filter(Boolean));
    const dedupedEnriched = mustSeeEnriched.filter((p) => p.placeId && !seenIds.has(p.placeId));
    const combinedRaw = [...rawPlaces, ...dedupedEnriched];

    const annotatedRaw = filterService.annotateCategories(combinedRaw, {
      iconicNames: mustSee.iconic,
      curatedNames: mustSee.curated,
    });

    const places = filterService.filterPlaces(annotatedRaw, { days: daysNum, intensity });
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: daysNum });

    // Rota optimizasyonu — gün-içi çap sınırı şehir geocode viewport'undan +
    // ulaşım modundan türetilir
    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(places, restaurants, daysNum, cityRadiusKm, transportMode);

    // LLM plan + bütçe + ipuçları paralel (her biri bağımsız, toplam süreyi düşürür)
    const [dailyPlan, budgetEstimate, cityInfo] = await Promise.all([
      llmService.generateDailyPlan({
        city, days: daysNum, budget, interests,
        places, restaurants, language: lang,
        optimizedPlaces, optimizedRestaurants, optimizedItinerary,
        maxDailyDiameterKm,
        countryName,
        intensity, transportMode,
      }),
      budgetService.calculateBudget({ city, days: daysNum, budget, countryCode }),
      resolveCityTips({ city, countryCode }),
    ]);

    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    let weather = null;
    if (startDate && endDate && cityGeo) {
      weather = await weatherService.getWeatherForecast(cityGeo.lat, cityGeo.lng, startDate, endDate);
    }

    res.json({
      trip: { city, days, budget, interests, startDate, endDate, countryCode, intensity, transportMode },
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
    const { intensity, transportMode } = resolvePreferences(req.body);

    if (!Array.isArray(rawPlaces) || !Array.isArray(rawRestaurants)) {
      return res.status(400).json({ error: 'rawPlaces and rawRestaurants must be arrays' });
    }

    const lang = resolveLanguage(language);
    const daysNum = Number(days);

    const cityGeo = await placesService.geocodeCity(city, lang);
    const countryCode = cityGeo?.countryCode || null;
    const countryName = resolveCountryName(countryCode);

    const [mustSee, mustSeeEnriched] = await Promise.all([
      mustSeeService.getMustSeeForCity({ cityName: city, countryCode, countryName }).catch((err) => {
        console.error('[planner] mustSee list failed:', err.message);
        return { iconic: [], curated: [] };
      }),
      mustSeeService.getMustSeePlacesEnriched({ cityName: city, countryCode, countryName, language: lang }).catch((err) => {
        console.error('[planner] mustSee enrich failed:', err.message);
        return [];
      }),
    ]);

    const seenIds = new Set(rawPlaces.map((p) => p.placeId).filter(Boolean));
    const dedupedEnriched = mustSeeEnriched.filter((p) => p.placeId && !seenIds.has(p.placeId));
    const combinedRaw = [...rawPlaces, ...dedupedEnriched];

    const annotatedRaw = filterService.annotateCategories(combinedRaw, {
      iconicNames: mustSee.iconic,
      curatedNames: mustSee.curated,
    });

    const places = filterService.filterPlaces(annotatedRaw, { days: daysNum, intensity });
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: daysNum });

    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(places, restaurants, daysNum, cityRadiusKm, transportMode);

    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    // Bütçe ve ipuçları paralel — LLM yolu için 2-3 sn tasarruf
    const [budgetEstimate, cityInfo] = await Promise.all([
      budgetService.calculateBudget({ city, days: daysNum, budget, countryCode }),
      resolveCityTips({ city, countryCode }),
    ]);

    let weather = null;
    if (startDate && endDate && cityGeo) {
      weather = await weatherService.getWeatherForecast(cityGeo.lat, cityGeo.lng, startDate, endDate);
    }

    res.json({
      language: lang,
      countryCode,
      intensity, transportMode,
      places, restaurants,
      optimizedPlaces, optimizedRestaurants, optimizedItinerary,
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

    const { city, days, budget, interests, language, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryCode } = req.body;
    const { intensity, transportMode } = resolvePreferences(req.body);

    if (!Array.isArray(places) || !Array.isArray(restaurants)) {
      return res.status(400).json({ error: 'places and restaurants must be arrays' });
    }

    const lang = resolveLanguage(language);
    const daysNum = Number(days);
    const countryName = resolveCountryName(countryCode);

    const dailyPlan = await llmService.generateDailyPlan({
      city, days: daysNum, budget, interests,
      places, restaurants, language: lang,
      optimizedPlaces, optimizedRestaurants, optimizedItinerary,
      maxDailyDiameterKm,
      countryName,
      intensity, transportMode,
    });

    res.json({ dailyPlan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
