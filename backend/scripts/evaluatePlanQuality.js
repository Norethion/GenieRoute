#!/usr/bin/env node
/**
 * Plan kalitesi değerlendirme runner'ı.
 *
 * Kullanım:
 *   node scripts/evaluatePlanQuality.js                 # tüm altın şehirler
 *   node scripts/evaluatePlanQuality.js --city Paris    # tek şehir
 *   node scripts/evaluatePlanQuality.js --days 5 --budget high
 *
 * Çıktı: backend/test/golden/results/<timestamp>.json + stdout Markdown tablo.
 *
 * Plan akışını routes/planner.js'in /generate rotasındaki ile aynı tutar
 * (Places search → filter → optimize → LLM). Kalkışta backend ayrı çalışsa da
 * çalışır; veritabanı bağlantısı gerektiren tek yer city tips/budget LLM
 * cache; metrik script'i sadece yer kalitesini ölçtüğü için bunlar atlanır.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

const placesService = require('../src/services/placesService');
const filterService = require('../src/services/filterService');
const llmService = require('../src/services/llmService');
const mustSeeService = require('../src/services/mustSeeService');
const routeOptimizer = require('../src/services/routeOptimizer');
const qualityMetrics = require('../src/services/qualityMetrics');

const GOLDEN_PATH = path.resolve(__dirname, '../test/golden/iconic.json');
const RESULTS_DIR = path.resolve(__dirname, '../test/golden/results');

function parseArgs(argv) {
  const args = {
    days: 3, budget: 'medium', interests: ['history', 'museum', 'food'],
    city: null, intensity: 'normal', transportMode: 'mixed',
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--city') args.city = argv[++i];
    else if (arg === '--days') args.days = Number(argv[++i]);
    else if (arg === '--budget') args.budget = argv[++i];
    else if (arg === '--interests') args.interests = argv[++i].split(',');
    else if (arg === '--intensity') args.intensity = argv[++i];
    else if (arg === '--transport') args.transportMode = argv[++i];
  }
  return args;
}

// computeCityRadiusKm: planner.js'tekinin aynısı; modül export etmediği için
// burada birebir tekrar edilir.
function computeCityRadiusKm(cityGeo) {
  const v = cityGeo?.viewport;
  if (!v?.northeast || !v?.southwest) return null;
  const diagKm = routeOptimizer.haversine(
    v.northeast.lat, v.northeast.lng,
    v.southwest.lat, v.southwest.lng
  );
  return (diagKm / 2) * 0.7;
}

async function evaluateCity({ city, country, goldenList, days, budget, interests, intensity = 'normal', transportMode = 'mixed' }) {
  const t0 = Date.now();
  console.log(`\n[${city}] starting evaluation (intensity=${intensity}, transport=${transportMode})...`);

  const [rawPlaces, rawRestaurants, cityGeo] = await Promise.all([
    placesService.searchPlaces(city, interests, 'en'),
    placesService.searchRestaurants(city, budget, 'en'),
    placesService.geocodeCity(city, 'en'),
  ]);

  const countryCode = cityGeo?.countryCode || null;
  const [mustSee, mustSeeEnriched] = await Promise.all([
    mustSeeService.getMustSeeForCity({ cityName: city, countryCode, countryName: country }).catch((err) => {
      console.warn(`[${city}] mustSee list failed:`, err.message);
      return { iconic: [], curated: [] };
    }),
    mustSeeService.getMustSeePlacesEnriched({ cityName: city, countryCode, countryName: country, language: 'en' }).catch((err) => {
      console.warn(`[${city}] mustSee enrich failed:`, err.message);
      return [];
    }),
  ]);
  console.log(`[${city}] must-see: ${mustSee.iconic.length} iconic, ${mustSee.curated.length} curated; enriched ${mustSeeEnriched.length}`);

  const seenIds = new Set(rawPlaces.map((p) => p.placeId).filter(Boolean));
  const dedupedEnriched = mustSeeEnriched.filter((p) => p.placeId && !seenIds.has(p.placeId));
  const combinedRaw = [...rawPlaces, ...dedupedEnriched];

  const annotatedRaw = filterService.annotateCategories(combinedRaw, {
    iconicNames: mustSee.iconic,
    curatedNames: mustSee.curated,
  });
  const places = filterService.filterPlaces(annotatedRaw, { days, intensity });
  const restaurants = filterService.filterRestaurants(rawRestaurants, { budget, days });

  const iconicInPool = places.filter((p) => p.category === 'iconic').length;
  const curatedInPool = places.filter((p) => p.category === 'curated').length;
  console.log(`[${city}] filtered pool: ${places.length} places (${iconicInPool} iconic, ${curatedInPool} curated)`);

  const cityRadiusKm = computeCityRadiusKm(cityGeo);
  const { optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm } =
    routeOptimizer.optimizeRoute(places, restaurants, days, cityRadiusKm, transportMode);

  const dailyPlan = await llmService.generateDailyPlan({
    city, days, budget, interests,
    places, restaurants, language: 'en',
    optimizedPlaces, optimizedRestaurants, optimizedItinerary,
    maxDailyDiameterKm,
    countryName: country,
    intensity, transportMode,
  });

  // Plan'daki yer adlarını koordinatlarla zenginleştir; geographic metrikler için
  const planWithCoords = {
    ...dailyPlan,
    days: dailyPlan.days.map((day) => ({
      ...day,
      activities: day.activities.map((act) => {
        const norm = qualityMetrics.normalizeName(act.place);
        const all = [...places, ...restaurants];
        const found = all.find((p) => {
          const pn = qualityMetrics.normalizeName(p.name);
          return pn === norm || pn.includes(norm) || norm.includes(pn);
        });
        return found ? { ...act, lat: found.lat, lng: found.lng } : act;
      }),
    })),
  };

  // Halüsinasyon: LLM'in önerdiği yer adlarından kaçı havuzda var
  const llmSuggestedNames = qualityMetrics.extractPlanPlaceNames(dailyPlan);
  const foundCanonicalNames = [...places, ...restaurants].map((p) => p.name);

  const metrics = qualityMetrics.computeAllMetrics({
    plan: planWithCoords,
    places: [...places, ...restaurants],
    goldenList,
    llmSuggestedNames,
    foundCanonicalNames,
  });

  const elapsed = Math.round((Date.now() - t0) / 100) / 10;
  console.log(`[${city}] done in ${elapsed}s — Iconic Recall: ${(metrics.iconicRecall.recall * 100).toFixed(0)}% (${metrics.iconicRecall.matched.length}/${metrics.iconicRecall.total})`);

  return {
    city, country, days, budget,
    elapsedSec: elapsed,
    poolSize: { places: places.length, restaurants: restaurants.length },
    maxDailyDiameterKm,
    metrics,
  };
}

function renderMarkdown(results) {
  const lines = [];
  lines.push('| City | Iconic Recall | Iconic Precision | Halluc. | Avg Max Km | Seq Quality | ILD |');
  lines.push('|------|---------------|------------------|---------|------------|-------------|-----|');
  for (const r of results) {
    if (r.error) {
      lines.push(`| ${r.city} | ❌ ${r.error.slice(0, 40)} | — | — | — | — | — |`);
      continue;
    }
    const m = r.metrics;
    const ir = m.iconicRecall ? `${(m.iconicRecall.recall * 100).toFixed(0)}% (${m.iconicRecall.matched.length}/${m.iconicRecall.total})` : '—';
    const ip = m.iconicPrecision ? `${(m.iconicPrecision.precision * 100).toFixed(0)}%` : '—';
    const hr = m.hallucinationRate ? `${(m.hallucinationRate.rate * 100).toFixed(0)}% (${m.hallucinationRate.missed}/${m.hallucinationRate.total})` : '—';
    const km = m.geographicCoherence.avgMaxKm.toFixed(1);
    const sq = m.sequenceQuality.avgRatio != null ? (m.sequenceQuality.avgRatio * 100).toFixed(0) + '%' : '—';
    const ild = m.ild.toFixed(2);
    lines.push(`| ${r.city} | ${ir} | ${ip} | ${hr} | ${km} | ${sq} | ${ild} |`);
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv);
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'));

  let cities = golden.cities;
  if (args.city) {
    cities = cities.filter((c) =>
      qualityMetrics.normalizeName(c.city) === qualityMetrics.normalizeName(args.city)
    );
    if (cities.length === 0) {
      console.error(`City "${args.city}" not in golden list.`);
      process.exit(1);
    }
  }

  console.log(`Evaluating ${cities.length} cities × ${args.days} days × budget=${args.budget}...`);

  const results = [];
  for (const c of cities) {
    try {
      const result = await evaluateCity({
        city: c.city,
        country: c.country,
        goldenList: c.iconic,
        days: args.days,
        budget: args.budget,
        interests: args.interests,
        intensity: args.intensity,
        transportMode: args.transportMode,
      });
      results.push(result);
    } catch (err) {
      console.error(`[${c.city}] FAILED:`, err.message);
      results.push({ city: c.city, country: c.country, error: err.message });
    }
  }

  // Aggregate
  const ok = results.filter((r) => !r.error);
  const aggregate = ok.length === 0 ? null : {
    avgIconicRecall: ok.reduce((s, r) => s + r.metrics.iconicRecall.recall, 0) / ok.length,
    avgIconicPrecision: ok.reduce((s, r) => s + r.metrics.iconicPrecision.precision, 0) / ok.length,
    avgHallucination: ok.reduce((s, r) => s + (r.metrics.hallucinationRate?.rate || 0), 0) / ok.length,
    avgMaxDailyKm: ok.reduce((s, r) => s + r.metrics.geographicCoherence.avgMaxKm, 0) / ok.length,
    avgSequenceQuality: (() => {
      const vs = ok.map((r) => r.metrics.sequenceQuality.avgRatio).filter((x) => x != null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    })(),
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outPath = path.join(RESULTS_DIR, `${timestamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ args, aggregate, results }, null, 2));

  console.log('\n=== RESULTS ===\n');
  console.log(renderMarkdown(results));

  if (aggregate) {
    console.log('\n=== AGGREGATE ===');
    console.log(`Iconic Recall avg:    ${(aggregate.avgIconicRecall * 100).toFixed(1)}%`);
    console.log(`Iconic Precision avg: ${(aggregate.avgIconicPrecision * 100).toFixed(1)}%`);
    console.log(`Hallucination avg:    ${(aggregate.avgHallucination * 100).toFixed(1)}%`);
    console.log(`Max daily km avg:     ${aggregate.avgMaxDailyKm.toFixed(2)} km`);
    console.log(`Seq quality avg:      ${aggregate.avgSequenceQuality != null ? (aggregate.avgSequenceQuality * 100).toFixed(1) + '%' : 'n/a'}`);
  }

  console.log(`\nFull results: ${outPath}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
