const axios = require('axios');

const EXCHANGE_API_BASE = 'https://open.er-api.com/v6/latest';
const CACHE_TTL = 60 * 60 * 1000; // 1 saat

// Base para birimi başına ayrı cache (USD, EUR, TRY, JPY, ...).
// open.er-api.com her base için ayrı endpoint sunar.
const cacheByBase = new Map();

// Base TRY/USD/EUR için API erişilemediğinde minimum garanti.
// Diğer para birimlerinde fallback yok — null oran döner ve caller
// kendi conversion'unu skip edebilir.
const FALLBACK_RATES = {
  TRY: { usd: 38.5, eur: 42.0, try: 1.0 },
  USD: { usd: 1.0, eur: 0.92, try: 0.026 },
  EUR: { usd: 1.08, eur: 1.0, try: 0.024 },
};

async function getExchangeRates(baseCurrency = 'TRY') {
  const base = (baseCurrency || 'TRY').toUpperCase();
  const now = Date.now();

  const cached = cacheByBase.get(base);
  if (cached && now - cached.ts < CACHE_TTL) {
    return cached.value;
  }

  try {
    const response = await axios.get(`${EXCHANGE_API_BASE}/${base}`, { timeout: 5000 });
    const apiRates = response.data?.rates;

    if (apiRates && apiRates.USD && apiRates.EUR && apiRates.TRY) {
      // API "1 BASE = X TARGET" döner. Biz "1 TARGET = ? BASE" istiyoruz
      // (totalLocal / rate = totalTarget mantığı için).
      const value = {
        base,
        usd: 1 / apiRates.USD,
        eur: 1 / apiRates.EUR,
        try: 1 / apiRates.TRY,
        updatedAt: new Date().toISOString(),
      };
      cacheByBase.set(base, { value, ts: now });
      return value;
    }
  } catch {
    // Aşağıda fallback'e düşer
  }

  // Cache'te eski bir değer varsa onu döndür (stale-while-error)
  if (cached) return cached.value;

  // Sabit fallback (sadece TRY/USD/EUR için anlamlı)
  const fb = FALLBACK_RATES[base];
  if (fb) {
    return {
      base,
      usd: fb.usd,
      eur: fb.eur,
      try: fb.try,
      updatedAt: null,
    };
  }

  // Bilinmeyen para birimi: caller conversion'u skip etsin
  return {
    base,
    usd: null,
    eur: null,
    try: null,
    updatedAt: null,
  };
}

module.exports = { getExchangeRates };
