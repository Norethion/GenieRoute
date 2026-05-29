const axios = require('axios');
const placeContentModel = require('../models/placeContentModel');
const { normalizeName } = require('./filterService');

// Wikimedia REST politikası açıklayıcı bir User-Agent ister.
const USER_AGENT = 'GenieRoute/1.0 (place description enrichment)';

// Tek bir REST "summary" ucundan özet çek. Bulunamaz/belirsiz (disambiguation)
// ya da hata → null (çağıran bir sonraki kaynağa düşsün). API anahtarı gerekmez.
async function fetchSummary(host, source, name, lang) {
  try {
    const url = `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    const response = await axios.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': lang },
      timeout: 5000,
    });
    const d = response.data;
    if (!d || d.type === 'disambiguation' || !d.extract) return null;
    return {
      name,
      lang,
      extract: d.extract,
      thumbUrl: d.thumbnail?.source || null,
      source,
      sourceUrl: d.content_urls?.desktop?.page || null,
    };
  } catch {
    return null; // 404 / ağ hatası — sıradaki kaynağa düş
  }
}

// Mekan için açıklama döndür: cache → Wikipedia → Wikivoyage (dil, sonra EN).
// Bulunursa cache'lenir; hiçbir kaynak vermezse cache'lemeden null (sonra tekrar denenir).
async function getPlaceContent(name, lang) {
  if (!name || typeof name !== 'string') return null;
  const norm = normalizeName(name);
  // norm boşsa (isim tamamen simge) cache anahtarı güvenilir değil → cache'siz çek.
  const placeKey = norm ? `${norm}:${lang}` : null;
  if (placeKey) {
    try {
      const cached = await placeContentModel.getContent(placeKey);
      if (cached) {
        return {
          name: cached.name,
          lang: cached.lang,
          extract: cached.extract,
          thumbUrl: cached.thumb_url,
          source: cached.source,
          sourceUrl: cached.source_url,
        };
      }
    } catch {
      // cache okunamazsa canlı çekmeye devam et
    }
  }

  const content =
    (await fetchSummary(`${lang}.wikipedia.org`, 'wikipedia', name, lang)) ||
    (await fetchSummary(`${lang}.wikivoyage.org`, 'wikivoyage', name, lang)) ||
    (lang !== 'en'
      ? await fetchSummary('en.wikivoyage.org', 'wikivoyage', name, 'en')
      : null);

  if (!content) return null;

  if (placeKey) {
    try {
      await placeContentModel.upsertContent({ placeKey, ...content });
    } catch {
      // cache yazılamazsa içeriği yine de döndür
    }
  }
  return content;
}

module.exports = { getPlaceContent };
