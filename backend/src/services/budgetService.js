const turkeyPrices = require('../data/turkeyPrices.json');
const { getExchangeRates } = require('./exchangeRateCache');

function normalizeCityKey(city) {
  const lower = city.toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[çÇ]/g, 'c')
    .replace(/[öÖ]/g, 'o')
    .replace(/[üÜ]/g, 'u')
    .replace(/[ğĞ]/g, 'g')
    .replace(/\s*\(.*\)\s*/, '');

  if (lower.includes('kapadokya') || lower.includes('cappadocia') || lower.includes('nevsehir')) {
    return 'kapadokya';
  }
  if (lower.includes('mugla') || lower.includes('bodrum') || lower.includes('fethiye') || lower.includes('marmaris')) {
    return 'mugla';
  }
  if (lower.includes('kas')) return 'kas';

  for (const key of Object.keys(turkeyPrices)) {
    if (key !== 'default' && lower.includes(key)) {
      return key;
    }
  }
  return 'default';
}

async function calculateBudget({ city, days, budget }) {
  const cityKey = normalizeCityKey(city);
  const prices = turkeyPrices[cityKey] || turkeyPrices.default;
  const budgetLevel = budget || 'medium';

  // Meals: breakfast + lunch + dinner (separate)
  const meals = prices.meals;
  const dailyBreakfast = meals.breakfast[budgetLevel] || meals.breakfast.medium;
  const dailyLunch = meals.lunch[budgetLevel] || meals.lunch.medium;
  const dailyDinner = meals.dinner[budgetLevel] || meals.dinner.medium;
  const dailyMeals = dailyBreakfast + dailyLunch + dailyDinner;

  // Transport: low=public, medium=mix, high=taxi
  const transport = prices.transport;
  let dailyTransport;
  if (budgetLevel === 'low') {
    dailyTransport = transport.public;
  } else if (budgetLevel === 'high') {
    dailyTransport = transport.taxi_daily.high;
  } else {
    dailyTransport = transport.taxi_daily.medium;
  }

  // Activities: museum average + tour based on budget
  const activities = prices.activities;
  const dailyActivities = activities.museum_avg + (activities.tour_avg[budgetLevel] || activities.tour_avg.medium);

  // Accommodation
  const dailyAccommodation = prices.accommodation[budgetLevel] || prices.accommodation.medium;

  const dailyTotal = dailyMeals + dailyTransport + dailyActivities + dailyAccommodation;
  const totalTRY = dailyTotal * days;

  const rates = await getExchangeRates();

  return {
    currency: 'TRY',
    daily: {
      meals: dailyMeals,
      mealsBreakdown: {
        breakfast: dailyBreakfast,
        lunch: dailyLunch,
        dinner: dailyDinner,
      },
      transport: dailyTransport,
      activities: dailyActivities,
      accommodation: dailyAccommodation,
      total: dailyTotal,
    },
    total: {
      try: totalTRY,
      usd: Math.round(totalTRY / rates.usd),
      eur: Math.round(totalTRY / rates.eur),
    },
    exchangeRates: {
      usd: Math.round(rates.usd * 100) / 100,
      eur: Math.round(rates.eur * 100) / 100,
      updatedAt: rates.updatedAt,
    },
    days,
    city: cityKey === 'default' ? city : cityKey,
    budgetLevel,
  };
}

module.exports = { calculateBudget };
