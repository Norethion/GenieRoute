#!/usr/bin/env node
/**
 * simulatePlans.js'in devamı: önceki çalışmada tamamlanan senaryoları atlayıp
 * 30-plan hedefini tamamlar. Sıralı per-city; concurrent restartlardaki
 * race'i azaltmak için cities arasında küçük stagger.
 */

const axios = require('axios');

const API = process.env.API_URL || 'http://localhost:3001/api';

// Önceki run'da hangi şehir hangi scenario'larda kaldı: Ankara=6, Paris=7, Barcelona=6
const REMAINING = {
  Ankara:    [6, 7, 8, 9],
  Paris:     [7, 8, 9],
  Barcelona: [6, 7, 8, 9],
};

const SCENARIOS = [
  { days: 2, interests: ['history', 'museum'],            intensity: 'relaxed',   transportMode: 'walking' },
  { days: 3, interests: ['food', 'nightlife'],            intensity: 'normal',    transportMode: 'transit' },
  { days: 3, interests: ['history', 'art'],               intensity: 'normal',    transportMode: 'mixed'   },
  { days: 3, interests: ['museum', 'culture'],            intensity: 'intensive', transportMode: 'walking' },
  { days: 4, interests: ['food', 'shopping'],             intensity: 'normal',    transportMode: 'transit' },
  { days: 4, interests: ['history', 'museum', 'food'],    intensity: 'normal',    transportMode: 'mixed'   },
  { days: 4, interests: ['art', 'culture'],               intensity: 'relaxed',   transportMode: 'walking' },
  { days: 5, interests: ['history', 'nature'],            intensity: 'normal',    transportMode: 'transit' },
  { days: 5, interests: ['food', 'art'],                  intensity: 'intensive', transportMode: 'car'     },
  { days: 3, interests: ['nightlife', 'food'],            intensity: 'normal',    transportMode: 'mixed'   },
];

async function generateAndSave(city, scenario) {
  const payload = {
    city,
    days: scenario.days,
    budget: 'medium',
    interests: scenario.interests,
    intensity: scenario.intensity,
    transportMode: scenario.transportMode,
    language: 'en',
  };
  const t0 = Date.now();
  const genRes = await axios.post(`${API}/planner/generate`, payload, { timeout: 180000 });
  const data = genRes.data;
  const planSlots = data.dailyPlan?.days?.reduce((sum, d) => sum + (d.activities?.length || 0), 0) || 0;
  const gMs = Date.now() - t0;

  const tripPayload = {
    city, days: scenario.days, budget: 'medium', interests: scenario.interests,
    planText: data.dailyPlan, placesJson: data.places, restaurantsJson: data.restaurants,
    budgetEstimate: data.budgetEstimate, cityInfo: data.cityInfo,
  };
  const saveT0 = Date.now();
  const saveRes = await axios.post(`${API}/trips`, tripPayload, { timeout: 30000 });
  const sMs = Date.now() - saveT0;

  return { tripId: saveRes.data.trip?.id, planSlots, gMs, sMs };
}

async function runCity(city, indices) {
  console.log(`\n=== ${city} ===`);
  const results = [];
  for (const i of indices) {
    const s = SCENARIOS[i];
    const label = `#${i + 1} ${s.days}d ${s.intensity}/${s.transportMode} [${s.interests.join(',')}]`;
    process.stdout.write(`  ${label} ... `);
    try {
      const r = await generateAndSave(city, s);
      console.log(`OK  tripId=${r.tripId}  ${r.planSlots} slots  gen=${(r.gMs / 1000).toFixed(1)}s  save=${r.sMs}ms`);
      results.push({ ok: true, ...r });
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      console.log(`FAIL  ${msg}`);
      results.push({ ok: false, err: msg });
    }
  }
  return results;
}

async function main() {
  const total = Object.values(REMAINING).reduce((s, a) => s + a.length, 0);
  console.log(`Continuing simulation: ${total} remaining plans`);
  console.log(`API: ${API}`);

  // Yine paralel — backend restart'tan sonra in-memory request sayacı sıfırlandı,
  // 10. istek tetiklemesi bu run'da tüm şehirler için olası
  const allStart = Date.now();
  const cities = Object.keys(REMAINING);
  const byCity = await Promise.all(cities.map((c) => runCity(c, REMAINING[c])));
  const totalSec = Math.round((Date.now() - allStart) / 1000);

  console.log(`\n=== SUMMARY (${totalSec}s) ===`);
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i];
    const rs = byCity[i];
    const ok = rs.filter((r) => r.ok).length;
    const tripIds = rs.filter((r) => r.tripId).map((r) => r.tripId).join(', ');
    console.log(`${city}: ${ok}/${rs.length} ok, new trip IDs: [${tripIds}]`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
