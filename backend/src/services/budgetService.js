const defaultPrices = require('../data/defaultPrices.json');
const countryInfo = require('../data/countryInfo.json');
const { getExchangeRates } = require('./exchangeRateCache');
const cityDataService = require('./cityDataService');

// cityDataService.normalizeCityKey ile aynı kuralı kullanır; planner.js dışarıdan
// import edebilsin diye burada da export edilir.
function normalizeCityKey(city) {
  return cityDataService.normalizeCityKey(city);
}

function computeFromStructure(prices, budgetLevel) {
  const meals = prices.meals;
  const dailyBreakfast = meals.breakfast[budgetLevel] || meals.breakfast.medium;
  const dailyLunch = meals.lunch[budgetLevel] || meals.lunch.medium;
  const dailyDinner = meals.dinner[budgetLevel] || meals.dinner.medium;
  const dailyMeals = dailyBreakfast + dailyLunch + dailyDinner;

  const transport = prices.transport;
  let dailyTransport;
  if (budgetLevel === 'low') {
    dailyTransport = transport.public;
  } else if (budgetLevel === 'high') {
    dailyTransport = transport.taxi_daily.high;
  } else {
    dailyTransport = transport.taxi_daily.medium;
  }

  const activities = prices.activities;
  const dailyActivities = activities.museum_avg + (activities.tour_avg[budgetLevel] || activities.tour_avg.medium);

  const dailyAccommodation = prices.accommodation[budgetLevel] || prices.accommodation.medium;

  const dailyTotal = dailyMeals + dailyTransport + dailyActivities + dailyAccommodation;

  return {
    daily: {
      meals: dailyMeals,
      mealsBreakdown: { breakfast: dailyBreakfast, lunch: dailyLunch, dinner: dailyDinner },
      transport: dailyTransport,
      activities: dailyActivities,
      accommodation: dailyAccommodation,
      total: dailyTotal,
    },
    dailyTotal,
  };
}

// dailyTotals frontend tooltip'inin dağılım çubuklarını çizmek için döner.
function computeDailyRange(samples, budgetLevel) {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const totals = [];
  for (const s of samples) {
    try {
      totals.push(computeFromStructure(s, budgetLevel).dailyTotal);
    } catch {
      // Bozuk sample'ı atla
    }
  }
  if (totals.length < 2) return null;
  const rounded = totals.map((t) => Math.round(t)).sort((a, b) => a - b);
  return {
    min: rounded[0],
    max: rounded[rounded.length - 1],
    dailyTotals: rounded,
  };
}

async function buildResponse({ days, budgetLevel, prices, currencyCode, source, sampleCount, cityKey, samples }) {
  const { daily, dailyTotal } = computeFromStructure(prices, budgetLevel);
  const totalLocal = dailyTotal * days;

  const rates = await getExchangeRates(currencyCode);

  // rates.usd = "1 USD kaç base", yani totalLocal / rates.usd = totalUSD
  const totalUsd = rates.usd ? Math.round(totalLocal / rates.usd) : null;
  const totalEur = rates.eur ? Math.round(totalLocal / rates.eur) : null;

  const dailyRange = computeDailyRange(samples, budgetLevel);

  return {
    currency: currencyCode,
    daily,
    dailyRange,
    total: {
      local: Math.round(totalLocal),
      usd: totalUsd,
      eur: totalEur,
    },
    exchangeRates: {
      base: rates.base,
      usd: rates.usd ? Math.round(rates.usd * 100) / 100 : null,
      eur: rates.eur ? Math.round(rates.eur * 100) / 100 : null,
      updatedAt: rates.updatedAt,
    },
    days,
    city: cityKey,
    budgetLevel,
    source,
    sampleCount,
  };
}

async function calculateBudget({ city, days, budget, countryCode }) {
  const budgetLevel = budget || 'medium';

  const country = countryCode ? countryInfo[countryCode] : null;
  const currencyCode = country?.currency || 'USD';
  const countryName = country?.name || countryCode || 'Unknown';

  try {
    const { merged, samples, sampleCount } = await cityDataService.getPricesForCity({
      cityName: city,
      countryCode,
      countryName,
      currencyCode,
      budgetLevel,
    });

    return buildResponse({
      days,
      budgetLevel,
      prices: merged,
      currencyCode,
      source: 'llm',
      sampleCount,
      samples,
      cityKey: cityDataService.normalizeCityKey(city),
    });
  } catch (err) {
    console.error('[budgetService] LLM failed, using default:', err.message);
    // LLM tamamen başarısızsa generic USD-bazlı fallback. Frontend'de USD/EUR
    // hâlâ gösterilebilir, böylece bütçe paneli boş kalmaz.
    return buildResponse({
      days,
      budgetLevel,
      prices: defaultPrices,
      currencyCode: 'USD',
      source: 'fallback',
      sampleCount: 0,
      cityKey: cityDataService.normalizeCityKey(city),
    });
  }
}

module.exports = { calculateBudget, normalizeCityKey, computeFromStructure, computeDailyRange };
