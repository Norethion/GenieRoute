const OpenAI = require('openai');
const { maxPairwiseDistance, suggestTransit } = require('./routeOptimizer');
const { PLAN_MODEL, buildChatParams } = require('../config/models');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// LLM'e gerçekçi ulaşım önerisi yaptırmak için gün başına mesafe metaverisi üret
function buildDayMeta(dayPlaces, dayRestaurants) {
  const all = [...(dayPlaces || []), ...(dayRestaurants || [])];
  if (all.length < 2) return { maxKm: 0, transit: 'walking' };
  const km = maxPairwiseDistance(all);
  return { maxKm: Math.round(km * 10) / 10, transit: suggestTransit(km) };
}

function buildPrompt({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryName, intensity = 'normal', transportMode = 'mixed', weatherDayParts = null, constraints = null }) {
  let placesText;
  let restaurantsText;
  let itineraryText = '';

  // Yeni: optimizedItinerary varsa, gün içinde yer+restoran karışık sıralı tek
  // liste olarak LLM'e gönderilir. Bu sayede lunch/dinner pozisyonları yerlerle
  // coğrafi sıraya göre iç içe geçer ve harita zig-zag çizmez.
  if (Array.isArray(optimizedItinerary) && optimizedItinerary.length > 0) {
    itineraryText = optimizedItinerary.map((dayItems, i) => {
      const dayPlaces = dayItems.filter((it) => it.kind === 'place');
      const dayRests = dayItems.filter((it) => it.kind === 'restaurant');
      const meta = buildDayMeta(dayPlaces, dayRests);
      const header = `Day ${i + 1} ordered itinerary (max distance ${meta.maxKm} km, transit: ${meta.transit}):`;
      const lines = dayItems.map((it, idx) => {
        const tag = it.kind === 'restaurant' ? '[RESTAURANT]' : '[PLACE]';
        // Yer kategorisi: iconic = dünyaca tanınmış simge, curated = niche kaliteli
        const catTag = it.kind === 'place' && it.category && it.category !== 'regular'
          ? ` [${it.category.toUpperCase()}]` : '';
        // Hava-duyarlı planlama için açık/kapalı mekan etiketi (yalnız yerlerde)
        const envTag = it.kind === 'place' && it.environment === 'outdoor'
          ? ' [OUTDOOR]'
          : it.kind === 'place' && it.environment === 'indoor' ? ' [INDOOR]' : '';
        const extra = it.kind === 'restaurant'
          ? `Rating: ${it.rating}, Price: ${it.priceLevel ?? 'unknown'}`
          : `Rating: ${it.rating}, Address: ${it.address}`;
        return `  ${idx + 1}. ${tag}${catTag}${envTag} ${it.name} (${extra})`;
      }).join('\n');
      return `${header}\n${lines}`;
    }).join('\n\n');
  }

  if (optimizedPlaces && optimizedPlaces.length > 0) {
    placesText = optimizedPlaces.map((dayPlaces, i) => {
      const meta = buildDayMeta(dayPlaces, optimizedRestaurants?.[i]);
      const header = `Day ${i + 1} (max distance within day: ${meta.maxKm} km, suggested transit: ${meta.transit}):`;
      const lines = dayPlaces.map((p) => `  - ${p.name} (Rating: ${p.rating}, Address: ${p.address})`).join('\n');
      return `${header}\n${lines}`;
    }).join('\n');
    restaurantsText = optimizedRestaurants.map((dayRests, i) =>
      `Day ${i + 1}:\n${dayRests.map((r) => `  - ${r.name} (Rating: ${r.rating}, Price: ${r.priceLevel ?? 'unknown'})`).join('\n')}`
    ).join('\n');
  } else {
    placesText = places
      .map((p) => `- ${p.name} (Rating: ${p.rating}, Address: ${p.address})`)
      .join('\n');
    restaurantsText = restaurants
      .map((r) => `- ${r.name} (Rating: ${r.rating}, Price level: ${r.priceLevel ?? 'unknown'})`)
      .join('\n');
  }

  const budgetLabelTr = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' }[budget] || budget;
  const budgetLabelEn = { low: 'Budget', medium: 'Mid-range', high: 'Premium' }[budget] || budget;
  const capLine = maxDailyDiameterKm
    ? `\nGeographic constraint: the per-day cluster diameter cap was ${Math.round(maxDailyDiameterKm * 10) / 10} km. Days with a higher max distance contain a forced outlier — call out the longer transit explicitly in that day's descriptions.`
    : '';

  const destination = countryName ? `${city}, ${countryName}` : city;

  const intensityHint = {
    relaxed: 'Pace: relaxed — fewer stops, longer breaks, leisurely tone in descriptions. Aim for 3-4 activities per day.',
    normal: 'Pace: balanced — typical tourist day with morning + afternoon coverage. Aim for 4-5 activities per day.',
    intensive: 'Pace: intensive — pack in more sights, suggest brisk transitions between stops. Aim for 5-6 activities per day, possibly with a quick snack stop instead of a full lunch.',
  }[intensity] || '';

  const transportHint = {
    walking: 'Transport: WALKING-FIRST plan — assume the user walks between stops; mention pleasant streets, pedestrian routes, and avoid suggesting taxis or distant transit.',
    transit: 'Transport: PUBLIC TRANSIT plan — name specific metro/tram/bus lines or stops between activities when applicable.',
    car: 'Transport: PRIVATE VEHICLE / TAXI plan — distances can be larger; mention parking notes if relevant.',
    mixed: 'Transport: mixed — choose the realistic option per leg (walking for short hops, transit/taxi for longer ones).',
  }[transportMode] || '';

  // İtinerary varsa onu vurgula; yoksa eski places+restaurants ayrı listelere düş
  const dataSection = itineraryText
    ? `Each day below lists items in their geographic visiting order — places and restaurants are already interleaved so lunch/dinner positions match the walking sequence. Use this order verbatim.\n\n${itineraryText}\n\nFor reference (full pools, do NOT add extras):\nPlaces:\n${placesText}\n\nRestaurants:\n${restaurantsText}`
    : `Places to visit:\n${placesText}\n\nRestaurants:\n${restaurantsText}`;

  const orderingRule = itineraryText
    ? '- IMPORTANT: For each day, follow the ordered itinerary above EXACTLY, keeping every item including ALL [RESTAURANT] stops. Assign each [RESTAURANT] a time slot by its POSITION in the sequence: if there is a single [RESTAURANT], use "lunch" when it falls in the first half of the day or "dinner" when it falls later; if there are two, the earlier one → "lunch" and the later → "dinner"; any further [RESTAURANT] → a snack/coffee slot ("mid-morning" or "late-afternoon", type "snack"). Map [PLACE] items to "morning"/"afternoon"/"evening" by their position. Do not drop any food stop. This preserves geographic flow and avoids zig-zag routes.'
    : '- Include morning, lunch, afternoon, and dinner activities for each day';

  const categoryRule = itineraryText
    ? '- Place tags: [ICONIC] = world-famous landmark (give 2-3 sentence rich description, mention historic/cultural significance); [CURATED] = niche local gem (mention what makes it special vs touristy alternatives); no tag = regular pick.'
    : '';

  // Hava tahmini (gün-parçası) — yağmurlu dilimlerde [AVOID OUTDOOR] işaretlenir.
  const weatherSection = Array.isArray(weatherDayParts) && weatherDayParts.length
    ? `\nWeather Forecast (by day-part — weatherCode/precip%):\n` +
      weatherDayParts.map((w, i) => {
        const fmt = (label, p) => `${label} ${p.weatherCode}/${p.precipProb}%${p.avoidOutdoor ? ' [AVOID OUTDOOR]' : ''}`;
        return `Day ${i + 1} (${w.date}): ${fmt('morning', w.morning)}, ${fmt('afternoon', w.afternoon)}, ${fmt('evening', w.evening)}`;
      }).join('\n')
    : '';

  const weatherRule = weatherSection
    ? '\n- WEATHER: For any day-part marked [AVOID OUTDOOR], schedule INDOOR places ([INDOOR]: museum, gallery, mall, covered market, restaurant/cafe) in that slot and move OUTDOOR places ([OUTDOOR]: parks, viewpoints, waterfronts) to a clear day-part. Respect each place\'s [OUTDOOR]/[INDOOR] tag. If a whole day is rainy, add an umbrella / indoor-first tip in that day\'s descriptions. Do NOT invent indoor places not in the data — only re-order / re-slot what is provided.'
    : '';

  // Diyet + erişilebilirlik kısıtları (tercihlerden) — her öneri için zorunlu.
  const dietary = Array.isArray(constraints?.dietary) ? constraints.dietary.filter(Boolean) : [];
  const accessibility = Array.isArray(constraints?.accessibility) ? constraints.accessibility.filter(Boolean) : [];
  const constraintsSection = (dietary.length || accessibility.length)
    ? `\nHARD CONSTRAINTS (must respect for every recommendation):\n` +
      (dietary.length ? `- Dietary: only suggest restaurants/cafes compatible with: ${dietary.join(', ')}. Note suitable dishes in descriptions.\n` : '') +
      (accessibility.length ? `- Accessibility: prefer step-free / wheelchair-accessible venues and routes; flag any stop that may be difficult for: ${accessibility.join(', ')}.\n` : '')
    : '';

  const constraintsRule = constraintsSection
    ? '\n- Honor all HARD CONSTRAINTS above. If a provided place violates a dietary/accessibility constraint, prefer another provided place and explain the swap briefly.'
    : '';

  return `You are a professional travel planner. You generate plans for any city worldwide.
The user will spend ${days} days in ${destination}.
Budget level: ${budgetLabelEn} (${budgetLabelTr})
Interests: ${interests.join(', ')}

${intensityHint}
${transportHint}

Include culturally relevant tips appropriate for ${destination}: local etiquette, dress codes for religious sites if applicable, local cuisine highlights, and any market or bargaining customs that apply in this destination.${capLine}

Create a daily travel plan using ONLY the following REAL place and restaurant data.

${dataSection}
${weatherSection}
${constraintsSection}
RULES:
- ONLY use places from the data above, do NOT invent new places
- The "place" field must contain ONLY the exact place name — NEVER include the bracketed tags ([PLACE], [RESTAURANT], [ICONIC], [CURATED], [INDOOR], [OUTDOOR]); those tags are metadata for you, not part of the name.
${orderingRule}
${categoryRule}${weatherRule}${constraintsRule}
- Places are pre-grouped by geographic proximity per day, maintain this grouping
- Do NOT swap places between days — the geographic clustering is fixed
- Reachability: each day's places must be reachable by realistic urban transit (walking, bus, minibus, tram, metro, taxi, or ferry). Use the "suggested transit" hint provided for each day
- If a day's max distance > 10 km, explicitly mention how to get between places (e.g. "vapurla Kadıköy'e geç", "metro ile Levent'e", "tramvayla Eminönü'nden")
- IMPORTANT: For each title and description, provide BOTH Turkish and English versions
- Respond ONLY in JSON format, no other text

JSON format (activities array can have 3-6 entries; time can be: "morning", "mid-morning", "lunch", "afternoon", "late-afternoon", "dinner", "evening"; type can be: "attraction", "restaurant", "snack"):
{
  "days": [
    {
      "day": 1,
      "title_tr": "Gün başlığı Türkçe",
      "title_en": "Day title English",
      "activities": [
        {
          "time": "morning",
          "place": "place name (exactly as provided above)",
          "description_tr": "Kısa açıklama Türkçe",
          "description_en": "Short description English",
          "type": "attraction"
        },
        {
          "time": "lunch",
          "place": "restaurant name",
          "description_tr": "Kısa açıklama Türkçe",
          "description_en": "Short description English",
          "type": "restaurant"
        },
        {
          "time": "afternoon",
          "place": "place name",
          "description_tr": "Kısa açıklama Türkçe",
          "description_en": "Short description English",
          "type": "attraction"
        },
        {
          "time": "dinner",
          "place": "restaurant name",
          "description_tr": "Kısa açıklama Türkçe",
          "description_en": "Short description English",
          "type": "restaurant"
        }
      ]
    }
  ],
  "tips_tr": ["Türkçe ipuçları"],
  "tips_en": ["English tips"]
}`;
}

async function generateDailyPlan({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryName, intensity, transportMode, weatherDayParts, constraints }) {
  const prompt = buildPrompt({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryName, intensity, transportMode, weatherDayParts, constraints });

  const response = await openai.chat.completions.create(
    buildChatParams(PLAN_MODEL, {
      messages: [{ role: 'user', content: prompt }],
      jsonMode: true,
      maxTokens: days * 700 + 1200,
      temperature: 0.7,
      reasoningEffort: 'low',
    })
  );

  const content = response.choices[0].message.content;

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('LLM returned invalid JSON. Please try again.');
  }

  if (!parsed.days || !Array.isArray(parsed.days)) {
    throw new Error('LLM response missing daily plan. Please try again.');
  }

  // Bazı modeller (gpt-5 ailesi) itinerary'deki [PLACE]/[ICONIC]/[INDOOR] gibi
  // köşeli-parantez etiketlerini place adının başına kopyalayabiliyor; temizle.
  for (const day of parsed.days) {
    if (!Array.isArray(day.activities)) continue;
    for (const act of day.activities) {
      if (typeof act.place === 'string') {
        act.place = act.place.replace(/^(?:\s*\[[^\]]*\]\s*)+/, '').trim();
      }
    }
  }

  return parsed;
}

module.exports = {
  generateDailyPlan,
};
