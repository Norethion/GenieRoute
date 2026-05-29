const OpenAI = require('openai');
const cityDataModel = require('../models/cityDataModel');
const { HELPER_MODEL, buildChatParams } = require('../config/models');

// Rolling FIFO cache: aynı (şehir, budget_level) için en fazla bu kadar sample
// tutulur; yeni sample eklendiğinde en eski FIFO ile düşürülür. Cap'e ulaşıldığında
// yeni plain LLM örneği üretilmez (median oturmuştur). Periyodik tazelik için
// her N istekte bir web_search ile fresh sample arkaplanda eklenir.
const MAX_SAMPLES = 200;
const WEB_SEARCH_INTERVAL = 10;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory request sayacı: process restart'ta sıfırlanır, "yaklaşık her 10 istek"
// hedefi için yeterli. Çok-instance'lı deployment'ta sayaç başına 10 kayar;
// MVP için tek instance kabul edilir.
const _requestCounts = new Map();

function bumpRequestCount(key) {
  const next = (_requestCounts.get(key) || 0) + 1;
  _requestCounts.set(key, next);
  return next;
}

// Cache anahtarı için kullanılır. budgetService'in versiyonu Türkçe alias
// mapping'leri içerir; bu sade versiyon yalnızca diakritik + lowercase yapar
// (LLM yolu Türkiye olmayan şehirlerle çalışır).
function normalizeCityKey(city) {
  return city
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .replace(/\s*\(.*\)\s*/g, '')
    .trim();
}

function median(numbers) {
  const arr = numbers.filter((n) => Number.isFinite(n));
  if (arr.length === 0) return 0;
  arr.sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

// Sayısal yapraklarda median, nesne dallarında recursive iniş.
// Median seçimi LLM'in halüsine bir outlier üretmesine karşı dayanıklılık sağlar.
function mergeRecursive(samples) {
  if (samples.length === 0) return null;
  if (samples.length === 1) return samples[0];

  const first = samples[0];
  if (typeof first === 'number') {
    return Math.round(median(samples));
  }
  if (first && typeof first === 'object') {
    const merged = {};
    for (const key of Object.keys(first)) {
      const subSamples = samples.map((s) => s?.[key]).filter((v) => v !== undefined);
      merged[key] = mergeRecursive(subSamples);
    }
    return merged;
  }
  return first;
}

// _meta alanı (web_search kaynak URL'leri vb.) median hesaplamasına girmesin
// diye sample'lardan ayıklanır. Samples[] içinde transparency için saklı kalır.
function stripMeta(sample) {
  if (!sample || typeof sample !== 'object') return sample;
  const { _meta, ...rest } = sample;
  return rest;
}

function applyFifoCap(samples, cap = MAX_SAMPLES) {
  if (samples.length <= cap) return samples;
  return samples.slice(samples.length - cap);
}

function isValidPriceSample(s) {
  return s && typeof s === 'object' &&
    s.meals && s.transport && s.activities && s.accommodation;
}

function isValidTipSample(s) {
  return s && typeof s === 'object' && (s.tr || s.en);
}

const PRICE_SCHEMA_PROMPT = `{
  "meals": {
    "breakfast": { "low": 0, "medium": 0, "high": 0 },
    "lunch":     { "low": 0, "medium": 0, "high": 0 },
    "dinner":    { "low": 0, "medium": 0, "high": 0 }
  },
  "transport": {
    "public": 0,
    "taxi_daily": { "low": 0, "medium": 0, "high": 0 }
  },
  "activities": {
    "museum_avg": 0,
    "tour_avg": { "low": 0, "medium": 0, "high": 0 }
  },
  "accommodation": { "low": 0, "medium": 0, "high": 0 }
}`;

const PRICE_FIELD_RULES = `Field rules:
- meals.* values are PER MEAL per person (not daily). low = budget eatery, medium = mid-range restaurant, high = upscale.
- transport.public = single ride on local public transport (one ticket).
- transport.taxi_daily = total daily taxi spending (low = minimal use, high = heavy use).
- activities.museum_avg = single entry to a typical museum.
- activities.tour_avg = daily cost of a guided tour or full-day excursion.
- accommodation = per night for one room (low = hostel, medium = mid-range hotel, high = luxury).`;

async function llmGeneratePrices(cityName, countryName, currencyCode) {
  const prompt = `You are a travel cost estimator. For the city "${cityName}" in ${countryName || 'this country'}, estimate realistic average prices in ${currencyCode}.

Return ONLY a JSON object with this EXACT structure (all values are positive integers in ${currencyCode}, no symbols, no comments):

${PRICE_SCHEMA_PROMPT}

${PRICE_FIELD_RULES}
- Be realistic for ${cityName} in 2026 prices.`;

  const response = await openai.chat.completions.create(
    buildChatParams(HELPER_MODEL, {
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      temperature: 0.6,
      maxTokens: 600,
      reasoningEffort: 'low',
    })
  );

  const text = response.choices[0].message.content;
  return JSON.parse(text);
}

// JSON'ın çevresindeki markdown fence'lerini soyup parse eder. Responses API
// + web_search ile gelen çıktıda model bazen ```json ... ``` sarar; defensive parse.
function parseLooseJson(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty LLM response');
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  }
  // İlk { ... son } arasını çıkar (model meta cümleler ekleyebilir)
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  return JSON.parse(cleaned);
}

function extractCitations(response) {
  const urls = [];
  const seen = new Set();
  const output = response?.output || [];
  for (const item of output) {
    const contents = item?.content || [];
    for (const c of contents) {
      const annotations = c?.annotations || [];
      for (const a of annotations) {
        if (a?.type === 'url_citation' && a?.url && !seen.has(a.url)) {
          seen.add(a.url);
          urls.push({ url: a.url, title: a.title || null });
        }
      }
    }
  }
  return urls;
}

async function llmGeneratePricesWithWebSearch(cityName, countryName, currencyCode) {
  const prompt = `Search the web for current 2026 traveler costs in "${cityName}", ${countryName || 'this country'}. Use Numbeo, BudgetYourTrip, official tourism sites, recent travel blogs.

Then return ONLY a JSON object with this EXACT structure (all values are positive integers in ${currencyCode}, no symbols, no comments, no markdown fences):

${PRICE_SCHEMA_PROMPT}

${PRICE_FIELD_RULES}
- Reflect 2026 current prices found on the web.`;

  const response = await openai.responses.create({
    model: HELPER_MODEL,
    tools: [{ type: 'web_search' }],
    input: prompt,
  });

  const text = response.output_text || '';
  const parsed = parseLooseJson(text);
  parsed._meta = {
    source: 'web_search',
    fetchedAt: new Date().toISOString(),
    citations: extractCitations(response),
  };
  return parsed;
}

async function llmGenerateTips(cityName, countryName) {
  const prompt = `You write travel tips for foreign tourists visiting "${cityName}" in ${countryName || 'this country'}.

Return ONLY a JSON object with this EXACT structure (Turkish + English versions, each field 2-4 sentences, practical and specific to ${cityName}):

{
  "tr": {
    "emergency": "Acil numaralar (yerel ülke kodlarıyla), turist polisi varsa.",
    "currency": "Yerel para birimi, ATM kullanımı, kart-nakit dengesi, pazarlık kültürü.",
    "transport": "Toplu taşıma sistemleri, bilet/kart, taksi uygulamaları, havalimanı bağlantıları.",
    "culture": "Dini ve kültürel mekanlarda davranış kuralları, kıyafet, açılış saatleri.",
    "food": "Yerel mutfak öne çıkanları, denenecek yemekler, popüler bölgeler."
  },
  "en": {
    "emergency": "Emergency numbers with local country codes, tourist police if available.",
    "currency": "Local currency, ATM usage, card vs cash balance, bargaining culture.",
    "transport": "Public transport systems, tickets/cards, taxi apps, airport links.",
    "culture": "Religious and cultural site etiquette, dress code, opening hours.",
    "food": "Local cuisine highlights, must-try dishes, popular dining areas."
  }
}

Be concrete: name actual transit cards (e.g. "Suica" for Tokyo, "Oyster" for London), specific dishes, real emergency numbers. Avoid generic advice.`;

  const response = await openai.chat.completions.create(
    buildChatParams(HELPER_MODEL, {
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      temperature: 0.6,
      maxTokens: 1200,
      reasoningEffort: 'low',
    })
  );

  const text = response.choices[0].message.content;
  return JSON.parse(text);
}

async function llmGenerateTipsWithWebSearch(cityName, countryName) {
  const prompt = `Search the web for current 2026 practical travel tips for foreign tourists visiting "${cityName}", ${countryName || 'this country'}. Look up current transit cards, taxi apps, emergency numbers, must-try local dishes, and cultural etiquette.

Then return ONLY a JSON object (no markdown fences, no extra commentary):

{
  "tr": {
    "emergency": "Acil numaralar (yerel ülke kodlarıyla), turist polisi varsa.",
    "currency": "Yerel para birimi, ATM kullanımı, kart-nakit dengesi, pazarlık kültürü.",
    "transport": "Toplu taşıma sistemleri, bilet/kart, taksi uygulamaları, havalimanı bağlantıları.",
    "culture": "Dini ve kültürel mekanlarda davranış kuralları, kıyafet, açılış saatleri.",
    "food": "Yerel mutfak öne çıkanları, denenecek yemekler, popüler bölgeler."
  },
  "en": {
    "emergency": "Emergency numbers with local country codes, tourist police if available.",
    "currency": "Local currency, ATM usage, card vs cash balance, bargaining culture.",
    "transport": "Public transport systems, tickets/cards, taxi apps, airport links.",
    "culture": "Religious and cultural site etiquette, dress code, opening hours.",
    "food": "Local cuisine highlights, must-try dishes, popular dining areas."
  }
}

Each field 2-4 sentences. Cite current 2026 sources.`;

  const response = await openai.responses.create({
    model: HELPER_MODEL,
    tools: [{ type: 'web_search' }],
    input: prompt,
  });

  const text = response.output_text || '';
  const parsed = parseLooseJson(text);
  parsed._meta = {
    source: 'web_search',
    fetchedAt: new Date().toISOString(),
    citations: extractCitations(response),
  };
  return parsed;
}

// Fire-and-forget refresh: kullanıcının cevabı bekleme, arka planda web_search
// sample'ı çek ve cache'e ekle (FIFO cap). Bir sonraki kullanıcı isteği bu
// taze sample'ı median'a katılmış olarak görür.
async function refreshPricesWithWebSearch({ cityName, countryCode, countryName, currencyCode, budgetLevel }) {
  const cityKey = normalizeCityKey(cityName);
  const t0 = Date.now();
  try {
    const webSample = await llmGeneratePricesWithWebSearch(cityName, countryName, currencyCode);
    if (!isValidPriceSample(webSample)) {
      console.warn(`[cityDataService] web prices sample invalid for ${cityName}/${budgetLevel}`);
      return;
    }
    // Race window: bu arada başka istek yeni sample yazmış olabilir; en taze row'u tekrar oku.
    const latest = await cityDataModel.getPricesRow(cityKey, budgetLevel);
    const samples = applyFifoCap([...(latest?.samples || []), webSample]);
    const merged = mergeRecursive(samples.map(stripMeta));
    await cityDataModel.upsertPrices({
      cityKey,
      cityDisplay: cityName,
      countryCode,
      currencyCode,
      budgetLevel,
      samples,
      merged,
    });
    const ms = Date.now() - t0;
    const citations = webSample._meta?.citations?.length || 0;
    console.log(`[cityDataService] web prices refresh ${cityName}/${budgetLevel} in ${ms}ms (${citations} sources)`);
  } catch (err) {
    console.error(`[cityDataService] web prices refresh failed for ${cityName}/${budgetLevel}:`, err.message);
  }
}

async function refreshTipsWithWebSearch({ cityName, countryCode, countryName }) {
  const cityKey = normalizeCityKey(cityName);
  const t0 = Date.now();
  try {
    const webSample = await llmGenerateTipsWithWebSearch(cityName, countryName);
    if (!isValidTipSample(webSample)) {
      console.warn(`[cityDataService] web tips sample invalid for ${cityName}`);
      return;
    }
    const latest = await cityDataModel.getTipsRow(cityKey);
    const samples = applyFifoCap([...(latest?.samples || []), webSample]);
    // Tips text alanlardan oluşur; merged her zaman en son örnektir.
    const merged = stripMeta(webSample);
    await cityDataModel.upsertTips({
      cityKey,
      cityDisplay: cityName,
      countryCode,
      samples,
      merged,
    });
    const ms = Date.now() - t0;
    const citations = webSample._meta?.citations?.length || 0;
    console.log(`[cityDataService] web tips refresh ${cityName} in ${ms}ms (${citations} sources)`);
  } catch (err) {
    console.error(`[cityDataService] web tips refresh failed for ${cityName}:`, err.message);
  }
}

async function getPricesForCity({ cityName, countryCode, countryName, currencyCode, budgetLevel }) {
  const cityKey = normalizeCityKey(cityName);
  const level = budgetLevel || 'medium';
  const row = await cityDataModel.getPricesRow(cityKey, level);

  // Her N istekte bir arkaplan web_search tetikle. Cache zaten dolu olsa bile
  // taze veri akışı sürer; race oluşursa refresh fonksiyonu en taze row'u
  // yeniden okur.
  const counterKey = `prices|${cityKey}|${level}`;
  const requestNo = bumpRequestCount(counterKey);
  if (requestNo % WEB_SEARCH_INTERVAL === 0) {
    refreshPricesWithWebSearch({ cityName, countryCode, countryName, currencyCode, budgetLevel: level })
      .catch(() => {}); // refreshXxx kendi loglamasını yapar
  }

  // Cap'e ulaşıldıysa median oturmuş kabul edilir; yeni plain LLM örneği üretme.
  // Web_search refresh'i FIFO ile yine de cache'e yeni sample ekleyebilir.
  if (row && row.sample_count >= MAX_SAMPLES && row.merged) {
    return {
      merged: row.merged,
      samples: row.samples,
      sampleCount: row.sample_count,
      currencyCode: row.currency_code,
    };
  }

  let newSample;
  try {
    newSample = await llmGeneratePrices(cityName, countryName, currencyCode);
  } catch (err) {
    console.error('[cityDataService] llmGeneratePrices failed:', err.message);
    if (row && row.merged) {
      return {
        merged: row.merged,
        samples: row.samples,
        sampleCount: row.sample_count,
        currencyCode: row.currency_code,
      };
    }
    throw err;
  }

  const samples = applyFifoCap([...(row?.samples || []), newSample]);
  const merged = mergeRecursive(samples.map(stripMeta));
  await cityDataModel.upsertPrices({
    cityKey,
    cityDisplay: cityName,
    countryCode,
    currencyCode,
    budgetLevel: level,
    samples,
    merged,
  });
  return { merged, samples, sampleCount: samples.length, currencyCode };
}

async function getTipsForCity({ cityName, countryCode, countryName }) {
  const cityKey = normalizeCityKey(cityName);
  const row = await cityDataModel.getTipsRow(cityKey);

  const counterKey = `tips|${cityKey}`;
  const requestNo = bumpRequestCount(counterKey);
  if (requestNo % WEB_SEARCH_INTERVAL === 0) {
    refreshTipsWithWebSearch({ cityName, countryCode, countryName }).catch(() => {});
  }

  if (row && row.sample_count >= MAX_SAMPLES && row.merged) {
    return { merged: row.merged, sampleCount: row.sample_count };
  }

  let newSample;
  try {
    newSample = await llmGenerateTips(cityName, countryName);
  } catch (err) {
    console.error('[cityDataService] llmGenerateTips failed:', err.message);
    if (row && row.merged) {
      return { merged: row.merged, sampleCount: row.sample_count };
    }
    throw err;
  }

  const samples = applyFifoCap([...(row?.samples || []), newSample]);
  // Tips text alanlardan oluşur, median uygulanamaz; en son örneği yansıt,
  // geçmiş örnekler samples[]'da gözlem amaçlı tutulur.
  const merged = stripMeta(newSample);
  await cityDataModel.upsertTips({
    cityKey,
    cityDisplay: cityName,
    countryCode,
    samples,
    merged,
  });
  return { merged, sampleCount: samples.length };
}

module.exports = {
  normalizeCityKey,
  getPricesForCity,
  getTipsForCity,
  _internal: {
    mergeRecursive, median, stripMeta, applyFifoCap, MAX_SAMPLES, WEB_SEARCH_INTERVAL,
    // Aşağıdakiler test/manuel-tetik amaçlı expose edilir; production yolunda
    // doğrudan çağrılmazlar — getPricesForCity/getTipsForCity'in 10. istek
    // sayacı bunları arka planda çalıştırır.
    refreshPricesWithWebSearch, refreshTipsWithWebSearch,
    llmGeneratePricesWithWebSearch, llmGenerateTipsWithWebSearch,
  },
};
