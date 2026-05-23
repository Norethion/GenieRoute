#!/usr/bin/env node
/**
 * Cache büyümesi + web_search trigger doğrulaması için kontrollü plan üretimi.
 * 3 şehir × 10 senaryo = 30 plan. Tümü medium budget → her şehir/medium
 * sayacı 10'a ulaşır ve fire-and-forget web_search tetiklenir.
 *
 * Her plan ardından /api/trips POST ile saved trip olarak kaydedilir.
 * "Kayıtlı Geziler" sayfasında inceleyebilirsin.
 *
 * Tek seferlik dev test scripti — committed olmasın diye .gitignore ekleyebiliriz.
 */

const axios = require('axios');

const API = process.env.API_URL || 'http://localhost:3001/api';
const CITIES = ['Ankara', 'Paris', 'Barcelona'];

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

async function generateAndSave(city, scenario, scenarioIndex) {
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

  // saved_plans tablosuna JSON kaydet (frontend ResultPage'in kaydet butonuyla aynı payload)
  const tripPayload = {
    city,
    days: scenario.days,
    budget: 'medium',
    interests: scenario.interests,
    planText: data.dailyPlan,
    placesJson: data.places,
    restaurantsJson: data.restaurants,
    budgetEstimate: data.budgetEstimate,
    cityInfo: data.cityInfo,
  };
  const saveT0 = Date.now();
  const saveRes = await axios.post(`${API}/trips`, tripPayload, { timeout: 30000 });
  const sMs = Date.now() - saveT0;

  const tripId = saveRes.data.trip?.id;
  return { tripId, planSlots, gMs, sMs, days: scenario.days, intensity: scenario.intensity, transportMode: scenario.transportMode };
}

async function runCity(city) {
  console.log(`\n=== ${city} ===`);
  const results = [];
  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];
    const label = `#${i + 1} ${s.days}d ${s.intensity}/${s.transportMode} [${s.interests.join(',')}]`;
    process.stdout.write(`  ${label} ... `);
    try {
      const r = await generateAndSave(city, s, i);
      console.log(`OK  tripId=${r.tripId}  ${r.planSlots} slots  gen=${(r.gMs / 1000).toFixed(1)}s  save=${r.sMs}ms`);
      results.push({ ok: true, ...r, label });
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      console.log(`FAIL  ${msg}`);
      results.push({ ok: false, label, err: msg });
    }
  }
  return results;
}

async function main() {
  console.log(`Simulating ${CITIES.length} cities × ${SCENARIOS.length} scenarios = ${CITIES.length * SCENARIOS.length} plans`);
  console.log(`API: ${API}`);

  // 3 şehir paralel; her şehir kendi içinde sıralı (sayaç deterministik).
  const allStart = Date.now();
  const byCity = await Promise.all(CITIES.map(runCity));
  const totalSec = Math.round((Date.now() - allStart) / 1000);

  console.log(`\n=== SUMMARY (${totalSec}s) ===`);
  for (let i = 0; i < CITIES.length; i++) {
    const city = CITIES[i];
    const rs = byCity[i];
    const ok = rs.filter((r) => r.ok).length;
    const totalSlots = rs.reduce((s, r) => s + (r.planSlots || 0), 0);
    const tripIds = rs.filter((r) => r.tripId).map((r) => r.tripId).join(', ');
    console.log(`${city}: ${ok}/${rs.length} ok, ${totalSlots} total activity slots, trip IDs: [${tripIds}]`);
  }

  // Web_search trigger sayısı (background, log'da görünür)
  console.log(`\nWeb_search trigger sayısı: ${CITIES.length} (her şehir 10. istekte 1 web_search).`);
  console.log(`Trigger'lar fire-and-forget; admin paneline yansıması için 5-10s bekle.`);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
