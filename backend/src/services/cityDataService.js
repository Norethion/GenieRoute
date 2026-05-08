const OpenAI = require('openai');
const cityDataModel = require('../models/cityDataModel');

// Aynı (şehir, budget_level) için en fazla bu kadar LLM örneği toplanır;
// sonrasında cache "stable" sayılır ve LLM bir daha çağrılmaz.
// 100 örnek median'ı ve min/max range'i istatistiksel olarak güvenli kılar.
const MAX_SAMPLES = 100;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

async function llmGeneratePrices(cityName, countryName, currencyCode) {
  const prompt = `You are a travel cost estimator. For the city "${cityName}" in ${countryName || 'this country'}, estimate realistic average prices in ${currencyCode}.

Return ONLY a JSON object with this EXACT structure (all values are positive integers in ${currencyCode}, no symbols, no comments):

{
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
}

Field rules:
- meals.* values are PER MEAL per person (not daily). low = budget eatery, medium = mid-range restaurant, high = upscale.
- transport.public = single ride on local public transport (one ticket).
- transport.taxi_daily = total daily taxi spending (low = minimal use, high = heavy use).
- activities.museum_avg = single entry to a typical museum.
- activities.tour_avg = daily cost of a guided tour or full-day excursion.
- accommodation = per night for one room (low = hostel, medium = mid-range hotel, high = luxury).
- Be realistic for ${cityName} in 2026 prices.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
    max_tokens: 600,
  });

  const text = response.choices[0].message.content;
  return JSON.parse(text);
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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.6,
    max_tokens: 1200,
  });

  const text = response.choices[0].message.content;
  return JSON.parse(text);
}

async function getPricesForCity({ cityName, countryCode, countryName, currencyCode, budgetLevel }) {
  const cityKey = normalizeCityKey(cityName);
  const level = budgetLevel || 'medium';
  const row = await cityDataModel.getPricesRow(cityKey, level);

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

  const samples = [...(row?.samples || []), newSample];
  const merged = mergeRecursive(samples);
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

  const samples = [...(row?.samples || []), newSample];
  // Tips text alanlardan oluşur, median uygulanamaz; en son örneği yansıt,
  // geçmiş örnekler samples[]'da gözlem amaçlı tutulur.
  const merged = newSample;
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
  _internal: { mergeRecursive, median },
};
