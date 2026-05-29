const OpenAI = require('openai');
const cityDataModel = require('../models/cityDataModel');
const cityDataService = require('./cityDataService');
const placesService = require('./placesService');
const { HELPER_MODEL, buildChatParams } = require('../config/models');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Bir şehir için "must-see" (iconic) ve "curated" (niche) yer adlarını
 * LLM'den toplar, PostgreSQL'de cache'ler. cityDataService'in fiyat/ipucu
 * cache desenini takip eder ama sample-ensemble yapmaz: must-see listesi
 * stabildir (Eyfel her sorguda Eyfel olur), tek sample yeterli.
 *
 * Filter aşamasında bu listeler kanonik isim havuzu olarak kullanılır;
 * Google Places'ten dönen her aday yer için 'iconic' / 'curated' / 'regular'
 * etiketi atanır. LLM plan promptunda etiket bilgisiyle önceliklendirme yapılır.
 */

async function llmGenerateMustSee(cityName, countryName) {
  const prompt = `You are a travel curator. List the top tourist attractions in "${cityName}, ${countryName || ''}".

Return ONLY a JSON object with this EXACT structure:

{
  "iconic": ["Name 1", "Name 2", ...],
  "curated": ["Name 1", "Name 2", ...]
}

Rules:
- "iconic" = 8-12 internationally-famous landmarks every first-time visitor expects to see (e.g. Eiffel Tower, Anne Frank House, Hagia Sophia). Include world-renowned museums, monuments, religious sites, parks.
- "curated" = 5-8 lesser-known gems beloved by locals or experienced travelers (specialty museums, neighborhoods, niche attractions). Should NOT overlap with iconic.
- Use the most common English names that match Google Maps listings (e.g. "Sagrada Família" not "Holy Family Basilica"; "Topkapı Palace" not "Topkapi Sarayi").
- Names must be REAL places that exist in ${cityName}. Do NOT invent or guess.
- No restaurants, no shops, no neighborhoods unless they are tourist destinations themselves (e.g. Montmartre OK, "downtown" not OK).`;

  const response = await openai.chat.completions.create(
    buildChatParams(HELPER_MODEL, {
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      temperature: 0.3,
      maxTokens: 700,
      reasoningEffort: 'low',
    })
  );

  const text = response.choices[0].message.content;
  const parsed = JSON.parse(text);
  const iconic = Array.isArray(parsed.iconic) ? parsed.iconic.filter((s) => typeof s === 'string') : [];
  const curated = Array.isArray(parsed.curated) ? parsed.curated.filter((s) => typeof s === 'string') : [];
  return { iconic, curated };
}

async function getMustSeeForCity({ cityName, countryCode, countryName }) {
  const cityKey = cityDataService.normalizeCityKey(cityName);
  const row = await cityDataModel.getMustSeeRow(cityKey);

  if (row && Array.isArray(row.iconic_names) && row.iconic_names.length > 0) {
    return {
      iconic: row.iconic_names,
      curated: row.curated_names || [],
      source: row.source || 'cache',
    };
  }

  let result;
  try {
    result = await llmGenerateMustSee(cityName, countryName);
  } catch (err) {
    console.error('[mustSeeService] llm failed:', err.message);
    return { iconic: [], curated: [], source: 'failed' };
  }

  await cityDataModel.upsertMustSee({
    cityKey,
    cityDisplay: cityName,
    countryCode,
    iconicNames: result.iconic,
    curatedNames: result.curated,
    source: 'llm',
  });

  return { ...result, source: 'llm' };
}

/**
 * LLM-üretimli must-see/curated isim listesini Places API'ye sokup koordinatlı
 * place objelerine çevirir. Lookup başarısız olanlar (halüsinasyon) atılır.
 * Dönüş: filterService.filterPlaces ile uyumlu, `category` etiketi atanmış,
 * gerçek koordinatlı dizi.
 *
 * Bu adım kritik: Google Places "Amsterdam museum" gibi sorgular Anne Frank
 * House / Rijksmuseum gibi mega-popüler yerleri ilk sonuçlara getirmeyebilir;
 * iconic havuzu LLM-curated listeyle pekiştiririz.
 */
async function getMustSeePlacesEnriched({ cityName, countryCode, countryName, language = 'en' }) {
  const list = await getMustSeeForCity({ cityName, countryCode, countryName });
  if (!list.iconic.length && !list.curated.length) return [];

  const iconicSet = new Set(list.iconic);
  const allNames = [...list.iconic, ...list.curated];
  const enriched = [];
  const lookups = await Promise.allSettled(
    allNames.map((name) => placesService.lookupPlace(name, cityName, language))
  );
  for (let i = 0; i < lookups.length; i++) {
    const res = lookups[i];
    if (res.status !== 'fulfilled' || !res.value) continue;
    const place = res.value;
    if (!place.lat || !place.lng) continue;
    enriched.push({
      ...place,
      category: iconicSet.has(allNames[i]) ? 'iconic' : 'curated',
      _sourceName: allNames[i],
    });
  }
  return enriched;
}

module.exports = { getMustSeeForCity, getMustSeePlacesEnriched };
