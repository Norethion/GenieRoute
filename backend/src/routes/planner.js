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

// Kaliteli mekan sayısı gün sayısının çok altındaysa (ör. küçük şehir) plan günlerini
// gerçekçi seviyeye indir — gün başına en az ~2 atraksiyon hedeflenir. Yeterliyse
// kullanıcının seçtiği gün korunur; hiç yer yoksa dokunma (LLM/notice devreye girer).
const MIN_PLACES_PER_DAY = 2;
function computeEffectiveDays(requestedDays, placeCount) {
  if (placeCount <= 0) return requestedDays;
  const maxByPlaces = Math.max(1, Math.ceil(placeCount / MIN_PLACES_PER_DAY));
  return Math.min(requestedDays, maxByPlaces);
}

// Kullanıcı bilgilendirmesi: gün kısıldıysa 'reduced_days', yine de gün başına 1'den
// az yer kaldıysa 'few_places', aksi halde uyarı yok.
function buildNotice(requestedDays, effectiveDays, placeCount) {
  if (effectiveDays < requestedDays) {
    return { type: 'reduced_days', requested: requestedDays, effective: effectiveDays, found: placeCount };
  }
  if (placeCount < effectiveDays) {
    return { type: 'few_places', found: placeCount, days: effectiveDays };
  }
  return undefined;
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
  // İlgi alanı değerleri LLM prompt'una birleştirilir; tür + uzunluk sınırı koy
  // (karakter kısıtı yok — Türkçe değerlere izin ver: "yemek", "gurme" vb.).
  if (interests.some((i) => typeof i !== 'string' || i.length < 1 || i.length > 50)) {
    return 'each interest must be a non-empty string up to 50 chars';
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

// Mekan adı normalizasyonu — frontend MapView.normalize ile AYNI: Türkçe diakritiği
// katla + noktalamayı at. İki katman aynı eşleşmeyi yapsın ki backend, frontend'in
// haritada pinleyeceği geçerli bir mekanı asla düşürmesin (düşürdüğü = frontend'in
// de eşleyemeyeceği gerçek bir havuz-dışı ad).
function normalizePlaceName(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Havuzu bir kez normalize et — her aktivite için pool adlarını yeniden normalize etme.
function buildMatchPool(items) {
  return (items || []).map((it) => ({
    it,
    lower: (it.name || '').toLowerCase(),
    norm: normalizePlaceName(it.name),
  }));
}

// frontend MapView.findMarkerForPlace ile AYNI algoritma: tam ad → normalize-tam →
// iki yönlü substring adaylarından uzunlukça en yakın olanı seç. Eşleşme yoksa null.
function matchInPool(mpool, placeName) {
  if (!placeName) return null;
  const lower = placeName.toLowerCase();
  const exact = mpool.find((e) => e.lower === lower);
  if (exact) return exact.it;
  const norm = normalizePlaceName(placeName);
  if (!norm) return null;
  const normExact = mpool.find((e) => e.norm === norm);
  if (normExact) return normExact.it;
  const cands = mpool.filter((e) => e.norm && (e.norm.includes(norm) || norm.includes(e.norm)));
  if (cands.length === 0) return null;
  return cands.reduce((best, e) =>
    Math.abs(e.norm.length - norm.length) < Math.abs(best.norm.length - norm.length) ? e : best
  ).it;
}

// Coğrafi sıraya dizilmiş aktivitelere kanonik zaman dilimi atar: restoranlar
// sıradaki konumuna göre öğle/akşam, gezilecek yerler sabah→akşam dilimlerine
// dağıtılır. Yeniden sıralamadan sonra etiketlerin monoton kalmasını sağlar.
const PLACE_SLOTS = ['morning', 'mid-morning', 'afternoon', 'late-afternoon', 'evening'];
function assignTimeSlots(activities) {
  let placeIdx = 0;
  let mealCount = 0;
  return activities.map((a) => {
    if (a.type === 'restaurant') {
      mealCount += 1;
      const time = mealCount === 1 ? 'lunch' : mealCount === 2 ? 'dinner' : 'late-afternoon';
      return { ...a, time };
    }
    if (a.type === 'snack') {
      return { ...a, time: a.time === 'late-afternoon' ? 'late-afternoon' : 'mid-morning' };
    }
    const time = PLACE_SLOTS[Math.min(placeIdx, PLACE_SLOTS.length - 1)];
    placeIdx += 1;
    return { ...a, time };
  });
}

// LLM çıktısını yer havuzu + optimizer çıktısıyla uzlaştırır:
//  (C1) Havuzda (places+restaurants) eşleşmeyen "uydurma" aktiviteleri düşürür —
//       aksi halde gün kartında görünür ama haritada pin'i olmazdı (sessiz tutarsızlık).
//       Eşleşme frontend ile AYNI algoritma (matchInPool) olduğundan yalnızca
//       frontend'in de pinleyemeyeceği adlar düşer; geçerli mekan kaybolmaz.
//  (C2) Hava-duyarlı plan YOKKEN her günün aktivitelerini optimizer'ın coğrafi
//       sırasına (optimizedItinerary) göre yeniden dizer ve dilimleri pozisyondan
//       türetir; böylece harita/gün-kartı sırası LLM'in keyfine değil deterministik
//       optimizer'a dayanır. Hava verisi varsa LLM'in hava-duyarlı dilim atamasını
//       (yağmurlu dilime kapalı mekan) bozmamak için yeniden sıralama yapılmaz.
function reconcilePlanWithItinerary(dailyPlan, optimizedItinerary, places, restaurants, { hasWeather = false } = {}) {
  if (!dailyPlan?.days?.length) return { dropped: 0 };
  const matchPool = buildMatchPool([...(places || []), ...(restaurants || [])]);
  const inPool = (name) => matchInPool(matchPool, name) !== null;

  let dropped = 0;
  for (let di = 0; di < dailyPlan.days.length; di++) {
    const day = dailyPlan.days[di];
    if (!Array.isArray(day.activities)) continue;

    const before = day.activities.length;
    const filtered = day.activities.filter((a) => inPool(a.place));
    // Bir günün TÜM aktiviteleri elenmesin: hepsi havuz-dışı çıkarsa (LLM çeviri/
    // sapma yapmış olabilir) orijinali koru — boş gün kartı, pinsiz karttan kötüdür.
    const acts0 = filtered.length ? filtered : day.activities;
    dropped += before - acts0.length;
    let acts = acts0;

    // optimizedItinerary optimizer'ın gün sırasıyla indekslidir; LLM günleri farklı
    // sırada/eksik dönebileceği için day.day (1-indeksli) ile hizala, yoksa di'ye düş.
    const dayIdx = Number.isInteger(day.day) && day.day >= 1 && day.day <= (optimizedItinerary?.length || 0)
      ? day.day - 1 : di;
    const itin = Array.isArray(optimizedItinerary) ? optimizedItinerary[dayIdx] : null;
    if (!hasWeather && Array.isArray(itin) && itin.length) {
      const itinPool = buildMatchPool(itin.map((x, idx) => ({ name: x.name, idx })));
      const orderOf = (name) => {
        const hit = matchInPool(itinPool, name);
        return hit ? hit.idx : Number.MAX_SAFE_INTEGER;
      };
      acts = acts
        .map((a, i) => ({ a, i, ord: orderOf(a.place) }))
        .sort((x, y) => x.ord - y.ord || x.i - y.i)
        .map((x) => x.a);
      acts = assignTimeSlots(acts);
    }

    day.activities = acts;
  }
  return { dropped };
}

// LLM çıktısındaki her aktiviteye saatli program ekler. Aktivitenin koordinatı,
// adı havuzda (reconcile ile AYNI matchInPool) eşlenerek bulunur; eşleşmeyen
// aktivite seyahat süresine katılmaz (yalnız kalma süresi sayılır).
function enrichWithSchedule(dailyPlan, places, restaurants, transportMode, hasTransit = true) {
  if (!dailyPlan?.days?.length) return dailyPlan;
  const matchPool = buildMatchPool([...(places || []), ...(restaurants || [])]);
  const findCoord = (name) => {
    const hit = matchInPool(matchPool, name);
    return hit ? { lat: hit.lat, lng: hit.lng } : {};
  };
  for (const day of dailyPlan.days) {
    if (!Array.isArray(day.activities)) continue;
    const withCoords = day.activities.map((a) => {
      const c = findCoord(a.place) || {};
      return { ...a, lat: c.lat, lng: c.lng };
    });
    const sched = routeOptimizer.computeSchedule(withCoords, transportMode, 570, hasTransit);
    day.activities = day.activities.map((a, i) => ({
      ...a,
      arrival: sched[i].arrival,
      departure: sched[i].departure,
      travelFromPrevMin: sched[i].travelFromPrevMin,
      travelMode: sched[i].travelMode,
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
    const [mustSee, mustSeeEnriched, hasTransit] = await Promise.all([
      mustSeeService.getMustSeeForCity({ cityName: city, countryCode, countryName }).catch((err) => {
        console.error('[planner] mustSee list failed:', err.message);
        return { iconic: [], curated: [] };
      }),
      mustSeeService.getMustSeePlacesEnriched({ cityName: city, countryCode, countryName, language: lang }).catch((err) => {
        console.error('[planner] mustSee enrich failed:', err.message);
        return [];
      }),
      llmService.assessCityHasTransit({ city, countryName }).catch(() => true),
    ]);

    const seenIds = new Set(rawPlaces.map((p) => p.placeId).filter(Boolean));
    const dedupedEnriched = mustSeeEnriched.filter((p) => p.placeId && !seenIds.has(p.placeId));
    const combinedRaw = [...rawPlaces, ...dedupedEnriched];

    const annotatedRaw = filterService.annotateCategories(combinedRaw, {
      iconicNames: mustSee.iconic,
      curatedNames: mustSee.curated,
    });

    // Rota optimizasyonu — gün-içi çap sınırı şehir geocode viewport'undan +
    // ulaşım modundan türetilir. Yemek odaklıysa gün başına 3 yemek durağı enjekte edilir.
    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const cityCenter = cityGeo ? { lat: cityGeo.lat, lng: cityGeo.lng } : null;
    // Şehir merkezine mesafe eşiği: yarıçapın 2 katı, en az 18 km. Plan TEK şehir
    // merkezi içindir; bunun ötesi gün-gezisidir (ör. Aydın'da 30 km'deki Nysa).
    // Büyük metropollerde viewport yarıçapı büyük olduğundan eşik de büyür (yayılma korunur);
    // küçük şehirlerde 18 km taban il-dışı uzak ilçeleri dışarıda bırakır.
    const maxPlaceRadiusKm = Math.max(18, (cityRadiusKm || 9) * 2);

    const candidatePlaces = filterService.filterPlaces(annotatedRaw, { days: daysNum, intensity, affinity, center: cityCenter, maxRadiusKm: maxPlaceRadiusKm });
    // Kaliteli mekan azsa gün sayısını gerçekçi seviyeye indir (gün başına ~2 atraksiyon).
    const effectiveDays = computeEffectiveDays(daysNum, candidatePlaces.length);
    // Restoran yarıçapı daha dar (en çok 15 km): restoranlar merkezde yoğundur, uzak
    // sahil/ilçe restoranı bir güne atanınca (özellikle yürüyüş modunda) saçma uzun bacak yaratır.
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: effectiveDays, restPerDay, center: cityCenter, maxRadiusKm: Math.min(maxPlaceRadiusKm, 15) });
    const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(candidatePlaces, restaurants, effectiveDays, cityRadiusKm, transportMode, restPerDay);
    // Optimizer gün-içi çapı aşan uzak outlier'ları düşürebilir; harita pinleri ve "X Mekan"
    // sayacı plana birebir uysun diye places'i yalnız plana giren (kümelenmiş) mekanlara indir.
    const keptPlaceNames = new Set(optimizedPlaces.flat().map((p) => p.name));
    const places = candidatePlaces.filter((p) => keptPlaceNames.has(p.name));

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
        city, days: effectiveDays, budget, interests,
        places, restaurants, language: lang,
        optimizedPlaces, optimizedRestaurants, optimizedItinerary,
        maxDailyDiameterKm,
        countryName,
        intensity, transportMode,
        weatherDayParts, constraints, hasTransit,
      }),
      budgetService.calculateBudget({ city, days: effectiveDays, budget, countryCode }),
      resolveCityTips({ city, countryCode }),
    ]);

    // LLM çıktısını yer havuzu + optimizer sırasıyla uzlaştır (uydurma mekanı düşür,
    // hava yoksa coğrafi sıraya diz), sonra deterministik saatli program ekle.
    const recon = reconcilePlanWithItinerary(dailyPlan, optimizedItinerary, places, restaurants, {
      hasWeather: Array.isArray(weatherDayParts) && weatherDayParts.length > 0,
    });
    if (recon.dropped) console.warn(`[planner/generate] ${recon.dropped} havuz-dışı aktivite düşürüldü (${city})`);
    enrichWithSchedule(dailyPlan, places, restaurants, transportMode, hasTransit);

    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    const notice = buildNotice(daysNum, effectiveDays, places.length);

    res.json({
      trip: { city, days: effectiveDays, requestedDays: daysNum, budget, interests, startDate, endDate, countryCode, intensity, transportMode },
      language: lang,
      dailyPlan,
      places, restaurants, mapMarkers,
      budgetEstimate, cityInfo, weather, weatherDayParts,
      notice,
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

    const [mustSee, mustSeeEnriched, hasTransit] = await Promise.all([
      mustSeeService.getMustSeeForCity({ cityName: city, countryCode, countryName }).catch((err) => {
        console.error('[planner] mustSee list failed:', err.message);
        return { iconic: [], curated: [] };
      }),
      mustSeeService.getMustSeePlacesEnriched({ cityName: city, countryCode, countryName, language: lang }).catch((err) => {
        console.error('[planner] mustSee enrich failed:', err.message);
        return [];
      }),
      llmService.assessCityHasTransit({ city, countryName }).catch(() => true),
    ]);

    const seenIds = new Set(rawPlaces.map((p) => p.placeId).filter(Boolean));
    const dedupedEnriched = mustSeeEnriched.filter((p) => p.placeId && !seenIds.has(p.placeId));
    const combinedRaw = [...rawPlaces, ...dedupedEnriched];

    const annotatedRaw = filterService.annotateCategories(combinedRaw, {
      iconicNames: mustSee.iconic,
      curatedNames: mustSee.curated,
    });

    const cityRadiusKm = computeCityRadiusKm(cityGeo);
    const cityCenter = cityGeo ? { lat: cityGeo.lat, lng: cityGeo.lng } : null;
    // Şehir merkezine mesafe eşiği: yarıçapın 2 katı, en az 18 km. Plan TEK şehir
    // merkezi içindir; bunun ötesi gün-gezisidir (ör. Aydın'da 30 km'deki Nysa).
    // Büyük metropollerde viewport yarıçapı büyük olduğundan eşik de büyür (yayılma korunur);
    // küçük şehirlerde 18 km taban il-dışı uzak ilçeleri dışarıda bırakır.
    const maxPlaceRadiusKm = Math.max(18, (cityRadiusKm || 9) * 2);

    const candidatePlaces = filterService.filterPlaces(annotatedRaw, { days: daysNum, intensity, affinity, center: cityCenter, maxRadiusKm: maxPlaceRadiusKm });
    // Kaliteli mekan azsa gün sayısını gerçekçi seviyeye indir (gün başına ~2 atraksiyon).
    const effectiveDays = computeEffectiveDays(daysNum, candidatePlaces.length);
    // Restoran yarıçapı daha dar (en çok 15 km): restoranlar merkezde yoğundur, uzak
    // sahil/ilçe restoranı bir güne atanınca (özellikle yürüyüş modunda) saçma uzun bacak yaratır.
    const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days: effectiveDays, restPerDay, center: cityCenter, maxRadiusKm: Math.min(maxPlaceRadiusKm, 15) });
    const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
      routeOptimizer.optimizeRoute(candidatePlaces, restaurants, effectiveDays, cityRadiusKm, transportMode, restPerDay);
    // Optimizer gün-içi çapı aşan uzak outlier'ları düşürebilir; harita pinleri ve "X Mekan"
    // sayacı plana birebir uysun diye places'i yalnız plana giren (kümelenmiş) mekanlara indir.
    const keptPlaceNames = new Set(optimizedPlaces.flat().map((p) => p.name));
    const places = candidatePlaces.filter((p) => keptPlaceNames.has(p.name));

    const mapMarkers = [
      ...places.map((p) => ({ ...p, markerType: 'attraction' })),
      ...restaurants.map((r) => ({ ...r, markerType: 'restaurant' })),
    ];

    // Bütçe ve ipuçları paralel — LLM yolu için 2-3 sn tasarruf
    const [budgetEstimate, cityInfo] = await Promise.all([
      budgetService.calculateBudget({ city, days: effectiveDays, budget, countryCode }),
      resolveCityTips({ city, countryCode }),
    ]);

    let weather = null;
    let weatherDayParts = null;
    if (startDate && endDate && cityGeo) {
      const w = await weatherService.getWeatherWithDayParts(cityGeo.lat, cityGeo.lng, startDate, endDate);
      weather = w?.daily ?? null;
      weatherDayParts = w?.weatherDayParts ?? null;
    }

    const notice = buildNotice(daysNum, effectiveDays, places.length);

    res.json({
      language: lang,
      countryCode,
      intensity, transportMode,
      // effectiveDays: az mekanlı şehirde indirilmiş gün sayısı; hasTransit: /llm enrich için.
      effectiveDays, hasTransit,
      places, restaurants,
      optimizedPlaces, optimizedRestaurants, optimizedItinerary,
      maxDailyDiameterKm,
      mapMarkers, budgetEstimate, cityInfo, weather, weatherDayParts,
      notice,
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

    const { city, days, budget, interests, language, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryCode, weatherDayParts, clientUuid, hasTransit } = req.body;
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
      constraints, hasTransit: hasTransit !== false,
    });

    // Uzlaştır (uydurma mekanı düşür + hava yoksa coğrafi sıra), sonra saatli program ekle.
    const recon = reconcilePlanWithItinerary(dailyPlan, optimizedItinerary, places, restaurants, {
      hasWeather: Array.isArray(weatherDayParts) && weatherDayParts.length > 0,
    });
    if (recon.dropped) console.warn(`[planner/llm] ${recon.dropped} havuz-dışı aktivite düşürüldü (${city})`);
    enrichWithSchedule(dailyPlan, places, restaurants, transportMode, hasTransit !== false);

    res.json({ dailyPlan });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
