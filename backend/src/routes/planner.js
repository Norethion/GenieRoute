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
const favoritesModel = require('../models/favoritesModel');
const preferencesModel = require('../models/preferencesModel');

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

// Kullanıcı yemek/mutfak odaklı ilgi alanı seçtiyse: restoran aramasını genişlet
// (kafe/sokak lezzeti/pazar) ve gün başına yemek durağını 3'e çıkar.
const FOOD_INTERESTS = ['food', 'cuisine', 'yemek', 'mutfak', 'gastronomy', 'gurme', 'lezzet'];
function isFoodFocused(interests) {
  if (!Array.isArray(interests)) return false;
  return interests.some((i) => FOOD_INTERESTS.includes(String(i).toLowerCase()));
}

// LLM çıktısındaki her aktiviteye saatli program ekler. Aktivitenin koordinatı,
// adı places+restaurants havuzunda eşlenerek bulunur; eşleşmeyen aktivite seyahat
// süresine katılmaz (yalnız kalma süresi sayılır). Saatler harita sırasıyla uyumlu.
function enrichWithSchedule(dailyPlan, places, restaurants, transportMode) {
  if (!dailyPlan?.days?.length) return dailyPlan;
  const pool = [...(places || []), ...(restaurants || [])];
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const findCoord = (name) => {
    const n = norm(name);
    if (!n) return null;
    let hit = pool.find((p) => norm(p.name) === n);
    if (!hit) hit = pool.find((p) => norm(p.name).includes(n) || n.includes(norm(p.name)));
    return hit ? { lat: hit.lat, lng: hit.lng } : {};
  };
  for (const day of dailyPlan.days) {
    if (!Array.isArray(day.activities)) continue;
    const withCoords = day.activities.map((a) => {
      const c = findCoord(a.place) || {};
      return { ...a, lat: c.lat, lng: c.lng };
    });
    const sched = routeOptimizer.computeSchedule(withCoords, transportMode);
    day.activities = day.activities.map((a, i) => ({
      ...a,
      arrival: sched[i].arrival,
      departure: sched[i].departure,
      travelFromPrevMin: sched[i].travelFromPrevMin,
      durationMin: sched[i].durationMin,
    }));
  }
  return dailyPlan;
}

function resolveLanguage(language) {
  return ['tr', 'en'].includes(language) ? language : 'en';
}

function validClientUuid(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\n\r]/.test(value);
}

// clientUuid varsa favorilerden affinity sinyali ve tercihlerden diyet/erişilebilirlik
// kısıtlarını yükle. Hata olursa sessizce null döner (plan üretimi etkilenmez).
async function loadPersonalization(clientUuid) {
  if (!validClientUuid(clientUuid)) return { affinity: null, constraints: null };
  const [stats, prefs] = await Promise.all([
    favoritesModel.getFavoriteStats(clientUuid).catch(() => null),
    preferencesModel.getPreferences(clientUuid).catch(() => null),
  ]);
  const affinity = stats ? filterService.buildAffinity(stats) : null;
  const constraints = prefs
    ? { dietary: prefs.dietary || [], accessibility: prefs.accessibility || [] }
    : null;
  return { affinity, constraints };
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

    const { city, days, budget, interests, language, startDate, endDate, clientUuid } = req.body;
    const { intensity, transportMode } = resolvePreferences(req.body);
    const lang = resolveLanguage(language);
    const daysNum = Number(days);
    const foodFocused = isFoodFocused(interests);
    // Gezi-sever varsayılan: günde 1 yemek/snack durağı; yemek ilgisi seçiliyse 2 (öğle + akşam)
    const restPerDay = foodFocused ? 2 : 1;

    const [rawPlaces, rawRestaurants, cityGeo, personalization] = await Promise.all([
      placesService.searchPlaces(city, interests, lang),
      placesService.searchRestaurants(city, budget, lang, foodFocused),
      placesService.geocodeCity(city, lang),
      loadPersonalization(clientUuid),
    ]);
    const { affinity, constraints } = personalization;

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

    const places = filterService.filterPlaces(annotatedRaw, { days: daysNum, intensity, affinity });
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: daysNum, restPerDay });

    // Rota optimizasyonu — gün-içi çap sınırı şehir geocode viewport'undan +
    // ulaşım modundan türetilir. Yemek odaklıysa gün başına 3 yemek durağı enjekte edilir.
    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(places, restaurants, daysNum, cityRadiusKm, transportMode, restPerDay);

    // Hava (gün-parçası) — LLM'e enjekte edilebilmesi için plan üretiminden ÖNCE çek.
    let weather = null;
    let weatherDayParts = null;
    if (startDate && endDate && cityGeo) {
      const w = await weatherService.getWeatherWithDayParts(cityGeo.lat, cityGeo.lng, startDate, endDate);
      weather = w?.daily ?? null;
      weatherDayParts = w?.weatherDayParts ?? null;
    }

    // LLM plan + bütçe + ipuçları paralel (her biri bağımsız, toplam süreyi düşürür)
    const [dailyPlan, budgetEstimate, cityInfo] = await Promise.all([
      llmService.generateDailyPlan({
        city, days: daysNum, budget, interests,
        places, restaurants, language: lang,
        optimizedPlaces, optimizedRestaurants, optimizedItinerary,
        maxDailyDiameterKm,
        countryName,
        intensity, transportMode,
        weatherDayParts, constraints,
      }),
      budgetService.calculateBudget({ city, days: daysNum, budget, countryCode }),
      resolveCityTips({ city, countryCode }),
    ]);

    // LLM çıktısına deterministik saatli program ekle (arrival/departure/seyahat süresi)
    enrichWithSchedule(dailyPlan, places, restaurants, transportMode);

    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    res.json({
      trip: { city, days, budget, interests, startDate, endDate, countryCode, intensity, transportMode },
      language: lang,
      dailyPlan,
      places, restaurants, mapMarkers,
      budgetEstimate, cityInfo, weather, weatherDayParts,
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

    const { city, days, budget, interests, language, startDate, endDate, rawPlaces, rawRestaurants, clientUuid } = req.body;
    const { intensity, transportMode } = resolvePreferences(req.body);

    if (!Array.isArray(rawPlaces) || !Array.isArray(rawRestaurants)) {
      return res.status(400).json({ error: 'rawPlaces and rawRestaurants must be arrays' });
    }

    const lang = resolveLanguage(language);
    const daysNum = Number(days);
    // Gezi-sever varsayılan: günde 1 yemek/snack durağı; yemek ilgisi seçiliyse 2 (öğle + akşam)
    const restPerDay = isFoodFocused(interests) ? 2 : 1;

    const [cityGeo, personalization] = await Promise.all([
      placesService.geocodeCity(city, lang),
      loadPersonalization(clientUuid),
    ]);
    const { affinity } = personalization;
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

    const places = filterService.filterPlaces(annotatedRaw, { days: daysNum, intensity, affinity });
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: daysNum, restPerDay });

    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(places, restaurants, daysNum, cityRadiusKm, transportMode, restPerDay);

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
    let weatherDayParts = null;
    if (startDate && endDate && cityGeo) {
      const w = await weatherService.getWeatherWithDayParts(cityGeo.lat, cityGeo.lng, startDate, endDate);
      weather = w?.daily ?? null;
      weatherDayParts = w?.weatherDayParts ?? null;
    }

    res.json({
      language: lang,
      countryCode,
      intensity, transportMode,
      places, restaurants,
      optimizedPlaces, optimizedRestaurants, optimizedItinerary,
      maxDailyDiameterKm,
      mapMarkers, budgetEstimate, cityInfo, weather, weatherDayParts,
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

    const { city, days, budget, interests, language, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryCode, weatherDayParts, clientUuid } = req.body;
    const { intensity, transportMode } = resolvePreferences(req.body);

    if (!Array.isArray(places) || !Array.isArray(restaurants)) {
      return res.status(400).json({ error: 'places and restaurants must be arrays' });
    }
    if (weatherDayParts != null && (!Array.isArray(weatherDayParts) || weatherDayParts.length > 14)) {
      return res.status(400).json({ error: 'weatherDayParts must be an array (max 14)' });
    }

    const lang = resolveLanguage(language);
    const daysNum = Number(days);
    const countryName = resolveCountryName(countryCode);

    // Diyet/erişilebilirlik kısıtları — LLM-only yolda da onurlandırılsın
    const { constraints } = await loadPersonalization(clientUuid);

    const dailyPlan = await llmService.generateDailyPlan({
      city, days: daysNum, budget, interests,
      places, restaurants, language: lang,
      optimizedPlaces, optimizedRestaurants, optimizedItinerary,
      maxDailyDiameterKm,
      countryName,
      intensity, transportMode,
      weatherDayParts: weatherDayParts || null,
      constraints,
    });

    // LLM çıktısına deterministik saatli program ekle (arrival/departure/seyahat süresi)
    enrichWithSchedule(dailyPlan, places, restaurants, transportMode);

    res.json({ dailyPlan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
