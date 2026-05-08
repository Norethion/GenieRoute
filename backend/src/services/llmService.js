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

function buildPrompt({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm, countryName }) {
  let placesText;
  let restaurantsText;

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

  return `You are a professional travel planner. You generate plans for any city worldwide.
The user will spend ${days} days in ${destination}.
Budget level: ${budgetLabelEn} (${budgetLabelTr})
Interests: ${interests.join(', ')}

Include culturally relevant tips appropriate for ${destination}: local etiquette, dress codes for religious sites if applicable, local cuisine highlights, and any market or bargaining customs that apply in this destination.${capLine}

Create a daily travel plan using ONLY the following REAL place and restaurant data.

Places to visit:
${placesText}

Restaurants:
${restaurantsText}

RULES:
- ONLY use places from the data above, do NOT invent new places
- Include morning, lunch, afternoon, and dinner activities for each day
- Places are pre-grouped by geographic proximity per day, maintain this grouping
- Do NOT swap places between days — the geographic clustering is fixed
- Reachability: each day's places must be reachable by realistic urban transit (walking, bus, minibus, tram, metro, taxi, or ferry). Use the "suggested transit" hint provided for each day
- If a day's max distance > 10 km, explicitly mention how to get between places (e.g. "vapurla Kadıköy'e geç", "metro ile Levent'e", "tramvayla Eminönü'nden")
- IMPORTANT: For each title and description, provide BOTH Turkish and English versions
- Respond ONLY in JSON format, no other text

JSON format:
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

async function generateDailyPlan({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm, countryName }) {
  const prompt = buildPrompt({ city, days, budget, interests, places, restaurants, optimizedPlaces, optimizedRestaurants, maxDailyDiameterKm, countryName });

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
