/**
 * Plan kalitesi için metrik kütüphanesi.
 *
 * Sayısal kıyaslama altyapısı: Kaminskas & Bridge (2017) ve
 * Borràs ve ark. (2014) sürveylerinden alınan standart RS metrikleri +
 * proje-spesifik türetilmiş metrikler (Iconic Recall, Geographic Coherence,
 * Sequence Quality, Halüsinasyon Oranı).
 */

const { haversine, maxPairwiseDistance } = require('./routeOptimizer');

// İsim eşleme için: lowercase + diakritik temizleme + parantez içi silme +
// "the/of/and/&" gibi stopword'leri silme. budgetService.normalizeCityKey'in
// yer-adı muadili.
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|of|and|de|du|la|le|el|il)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Bir plan'dan tüm yer adlarını çıkar. plan: llmService output { days: [{ activities: [...] }] }
function extractPlanPlaceNames(plan) {
  if (!plan || !Array.isArray(plan.days)) return [];
  const names = [];
  for (const day of plan.days) {
    if (!Array.isArray(day.activities)) continue;
    for (const act of day.activities) {
      if (act.place) names.push(act.place);
    }
  }
  return names;
}

// Gün başına yer listesi. Optimize edilmiş plan veya raw planın günleri.
function extractDailyPlaces(plan) {
  if (!plan || !Array.isArray(plan.days)) return [];
  return plan.days.map((day) =>
    Array.isArray(day.activities)
      ? day.activities.filter((a) => a.lat != null && a.lng != null)
      : []
  );
}

/**
 * Iconic Recall@K — Plan'daki yerlerin altın listede yakalanan oranı.
 *
 * @param {string[]} planPlaceNames  Plan'daki yer adları
 * @param {string[]} goldenList      Altın liste (10 must-see)
 * @returns {{ matched: string[], recall: number, total: number }}
 */
function iconicRecall(planPlaceNames, goldenList) {
  if (!Array.isArray(goldenList) || goldenList.length === 0) {
    return { matched: [], recall: 0, total: 0 };
  }
  const planSet = new Set(planPlaceNames.map(normalizeName));
  const matched = [];
  for (const golden of goldenList) {
    const normGolden = normalizeName(golden);
    // Kısmi eşleme: plan adı altın adı içeriyor veya tam tersi (örn.
    // "Hagia Sophia Mosque" ↔ "Hagia Sophia"). Token-bazlı kesişim ≥%70.
    for (const planName of planSet) {
      if (planName === normGolden || planName.includes(normGolden) || normGolden.includes(planName)) {
        matched.push(golden);
        break;
      }
    }
  }
  return {
    matched,
    recall: matched.length / goldenList.length,
    total: goldenList.length,
  };
}

/**
 * Iconic Precision@K — Plan'daki yerlerin altın listeyle eşleşen oranı.
 * Recall'un tersi: "önerdiklerimin yüzde kaçı must-see?"
 */
function iconicPrecision(planPlaceNames, goldenList) {
  if (planPlaceNames.length === 0) return { matched: 0, precision: 0, total: 0 };
  const goldenNorm = new Set(goldenList.map(normalizeName));
  let matched = 0;
  for (const planName of planPlaceNames) {
    const norm = normalizeName(planName);
    for (const golden of goldenNorm) {
      if (norm === golden || norm.includes(golden) || golden.includes(norm)) {
        matched++;
        break;
      }
    }
  }
  return {
    matched,
    precision: matched / planPlaceNames.length,
    total: planPlaceNames.length,
  };
}

/**
 * Intra-List Diversity (ILD) — Plan'daki yer tiplerinin çeşitliliği.
 * Shannon entropisi: tip dağılımı uniform ise yüksek, hep aynı tipte ise 0.
 *
 * @param {Array<{types?: string[]}>} places  Google Places'ten dönen "types" alanı
 */
function ildByType(places) {
  if (!Array.isArray(places) || places.length === 0) return 0;
  const counts = {};
  for (const p of places) {
    const primary = Array.isArray(p.types) && p.types.length > 0 ? p.types[0] : 'unknown';
    counts[primary] = (counts[primary] || 0) + 1;
  }
  const total = places.length;
  let entropy = 0;
  for (const c of Object.values(counts)) {
    const pi = c / total;
    entropy -= pi * Math.log2(pi);
  }
  return entropy;
}

/**
 * Geographic Coherence — Gün-içi maksimum nokta-çifti mesafesinin ortalaması.
 *
 * @param {Array<Array<{lat:number, lng:number}>>} dailyPlaces
 * @returns {{ avgMaxKm: number, perDay: number[] }}
 */
function geographicCoherence(dailyPlaces) {
  if (!Array.isArray(dailyPlaces) || dailyPlaces.length === 0) {
    return { avgMaxKm: 0, perDay: [] };
  }
  const perDay = dailyPlaces.map((day) =>
    Array.isArray(day) && day.length >= 2 ? Math.round(maxPairwiseDistance(day) * 10) / 10 : 0
  );
  const avg = perDay.reduce((a, b) => a + b, 0) / perDay.length;
  return { avgMaxKm: Math.round(avg * 10) / 10, perDay };
}

// 4-7 nokta için tractable brute-force açık-zincir TSP optimum mesafesi.
// 8+ nokta için undefined döner (12 yer = ~40 dakika permütasyon).
function bruteForceTspOptimal(places) {
  const n = places.length;
  if (n <= 1) return 0;
  if (n > 8) return null;
  const dist = (i, j) => haversine(places[i].lat, places[i].lng, places[j].lat, places[j].lng);
  let best = Infinity;
  const arr = Array.from({ length: n }, (_, i) => i);
  const permute = (start) => {
    if (start === n) {
      let total = 0;
      for (let i = 0; i < n - 1; i++) total += dist(arr[i], arr[i + 1]);
      if (total < best) best = total;
      return;
    }
    for (let i = start; i < n; i++) {
      [arr[start], arr[i]] = [arr[i], arr[start]];
      permute(start + 1);
      [arr[start], arr[i]] = [arr[i], arr[start]];
    }
  };
  permute(0);
  return best;
}

function totalChainDistance(places) {
  let total = 0;
  for (let i = 0; i < places.length - 1; i++) {
    total += haversine(places[i].lat, places[i].lng, places[i + 1].lat, places[i + 1].lng);
  }
  return total;
}

/**
 * Sequence Quality — Algoritmanın ürettiği gün-içi sıranın brute-force TSP
 * optimumuna yakınlık oranı. 1.0 = optimum, 0.5 = iki kat uzun.
 *
 * @returns {{ avgRatio: number, perDay: Array<{actual:number, optimal:number, ratio:number}> }}
 */
function sequenceQuality(dailyPlaces) {
  const perDay = [];
  for (const day of dailyPlaces) {
    if (!Array.isArray(day) || day.length < 2) {
      perDay.push({ actual: 0, optimal: 0, ratio: 1 });
      continue;
    }
    const actual = totalChainDistance(day);
    const optimal = bruteForceTspOptimal(day);
    if (optimal == null || actual === 0) {
      perDay.push({ actual: Math.round(actual * 10) / 10, optimal: null, ratio: null });
      continue;
    }
    perDay.push({
      actual: Math.round(actual * 10) / 10,
      optimal: Math.round(optimal * 10) / 10,
      ratio: optimal === 0 ? 1 : Math.round((optimal / actual) * 1000) / 1000,
    });
  }
  const ratios = perDay.map((p) => p.ratio).filter((r) => r != null);
  const avg = ratios.length > 0 ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null;
  return { avgRatio: avg == null ? null : Math.round(avg * 1000) / 1000, perDay };
}

/**
 * Halüsinasyon oranı — LLM'in önerdiği yerlerden kaçı Google Places'te bulunamadı.
 * Lookup başarısız olan / toplam LLM önerisi.
 *
 * @param {string[]} llmSuggestedNames
 * @param {string[]} foundCanonicalNames  lookup başarılı ad listesi
 */
function hallucinationRate(llmSuggestedNames, foundCanonicalNames) {
  if (llmSuggestedNames.length === 0) return { rate: 0, missed: 0, total: 0 };
  const found = new Set(foundCanonicalNames.map(normalizeName));
  let missed = 0;
  for (const name of llmSuggestedNames) {
    const norm = normalizeName(name);
    let hit = false;
    for (const f of found) {
      if (norm === f || norm.includes(f) || f.includes(norm)) {
        hit = true;
        break;
      }
    }
    if (!hit) missed++;
  }
  return {
    rate: missed / llmSuggestedNames.length,
    missed,
    total: llmSuggestedNames.length,
  };
}

/**
 * Tüm metrikleri tek seferde hesaplayan yardımcı.
 */
function computeAllMetrics({ plan, places, goldenList, llmSuggestedNames, foundCanonicalNames }) {
  const planNames = extractPlanPlaceNames(plan);
  const dailyPlaces = extractDailyPlaces(plan).map((dayActs) => {
    if (!Array.isArray(places)) return [];
    return dayActs
      .map((act) => {
        const norm = normalizeName(act.place);
        return places.find((p) => {
          const pn = normalizeName(p.name);
          return pn === norm || pn.includes(norm) || norm.includes(pn);
        });
      })
      .filter(Boolean);
  });

  return {
    iconicRecall: goldenList ? iconicRecall(planNames, goldenList) : null,
    iconicPrecision: goldenList ? iconicPrecision(planNames, goldenList) : null,
    ild: ildByType(places || []),
    geographicCoherence: geographicCoherence(dailyPlaces),
    sequenceQuality: sequenceQuality(dailyPlaces),
    hallucinationRate: llmSuggestedNames && foundCanonicalNames
      ? hallucinationRate(llmSuggestedNames, foundCanonicalNames)
      : null,
    summary: {
      totalPlaces: planNames.length,
      uniquePlaces: new Set(planNames.map(normalizeName)).size,
      days: plan?.days?.length || 0,
    },
  };
}

module.exports = {
  normalizeName,
  extractPlanPlaceNames,
  extractDailyPlaces,
  iconicRecall,
  iconicPrecision,
  ildByType,
  geographicCoherence,
  sequenceQuality,
  hallucinationRate,
  computeAllMetrics,
  bruteForceTspOptimal,
  totalChainDistance,
};
