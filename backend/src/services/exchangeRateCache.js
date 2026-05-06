const axios = require('axios');

const EXCHANGE_API_URL = 'https://open.er-api.com/v6/latest/TRY';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

let cache = null;
let cacheTimestamp = 0;

async function getExchangeRates() {
  const now = Date.now();
  if (cache && now - cacheTimestamp < CACHE_TTL) {
    return cache;
  }

  try {
    const response = await axios.get(EXCHANGE_API_URL, { timeout: 5000 });
    const rates = response.data.rates;

    if (rates && rates.USD && rates.EUR) {
      // API returns TRY-based rates (1 TRY = X USD), we need TRY/USD (1 USD = X TRY)
      cache = {
        usd: 1 / rates.USD,
        eur: 1 / rates.EUR,
        updatedAt: new Date().toISOString(),
      };
      cacheTimestamp = now;
      return cache;
    }
  } catch {
    // Fall back to cache or defaults
  }

  // Return cached value or fallback
  return cache || { usd: 38.5, eur: 42.0, updatedAt: null };
}

module.exports = { getExchangeRates };
