const OpenAI = require('openai');
const { maxPairwiseDistance, suggestTransit } = require('./routeOptimizer');

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

function buildPrompt({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryName, intensity = 'normal', transportMode = 'mixed' }) {
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
        const extra = it.kind === 'restaurant'
          ? `Rating: ${it.rating}, Price: ${it.priceLevel ?? 'unknown'}`
          : `Rating: ${it.rating}, Address: ${it.address}`;
        return `  ${idx + 1}. ${tag}${catTag} ${it.name} (${extra})`;
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
    ? '- IMPORTANT: For each day, follow the ordered itinerary above EXACTLY. Map item 1 → "morning", the first [RESTAURANT] → "lunch", the next [PLACE] → "afternoon", and the second [RESTAURANT] → "dinner". This preserves geographic flow and avoids zig-zag routes.'
    : '- Include morning, lunch, afternoon, and dinner activities for each day';

  const categoryRule = itineraryText
    ? '- Place tags: [ICONIC] = world-famous landmark (give 2-3 sentence rich description, mention historic/cultural significance); [CURATED] = niche local gem (mention what makes it special vs touristy alternatives); no tag = regular pick.'
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

RULES:
- ONLY use places from the data above, do NOT invent new places
${orderingRule}
${categoryRule}
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

async function generateDailyPlan({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryName, intensity, transportMode }) {
  const prompt = buildPrompt({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, optimizedItinerary, maxDailyDiameterKm, countryName, intensity, transportMode });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: days * 700 + 1200,
    temperature: 0.7,
  });

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

  return parsed;
}

module.exports = {
  generateDailyPlan,
};
