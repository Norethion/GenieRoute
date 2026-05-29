const axios = require('axios');

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// Gün-parçası saat kovaları (yerel saat). Open-Meteo timezone='auto' ile zaten
// şehir saatine göre döner.
const DAY_PARTS = {
  morning: [6, 7, 8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16, 17],
  evening: [18, 19, 20, 21, 22, 23],
};

// Açık-hava kaçınma eşiği: bir parça içinde max yağış olasılığı %55+ ise VEYA
// WMO kodu 61+ (yağmur/kar/fırtına ailesi) ise dışarı önerilmez.
const AVOID_PRECIP_PROB = 55;
const AVOID_WEATHER_CODE = 61;

/**
 * Fetch weather forecast from Open-Meteo API (günlük özet — mevcut kontrat).
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Array} Daily weather data
 */
async function getWeatherForecast(lat, lng, startDate, endDate) {
  try {
    const response = await axios.get(OPEN_METEO_URL, {
      params: {
        latitude: lat,
        longitude: lng,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
        start_date: startDate,
        end_date: endDate,
        timezone: 'auto',
      },
      timeout: 5000,
    });

    const { daily } = response.data;
    if (!daily || !daily.time) return null;

    return daily.time.map((date, i) => ({
      date,
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      precipitation: daily.precipitation_sum[i],
      weatherCode: daily.weathercode[i],
    }));
  } catch {
    return null;
  }
}

// hourly.time = "YYYY-MM-DDTHH:00" — bir tarih+parça için saatleri bucket'la,
// yağış olasılığında max, weatherCode'da max (severity proxy) al.
function buildPartsForDate(dateStr, hourly) {
  const idxByHour = {};
  hourly.time.forEach((t, i) => {
    if (!t.startsWith(dateStr)) return;
    const hour = Number(t.slice(11, 13));
    idxByHour[hour] = i;
  });

  const buildPart = (hours) => {
    let precipProb = 0;
    let weatherCode = 0;
    let seen = false;
    for (const h of hours) {
      const i = idxByHour[h];
      if (i == null) continue;
      seen = true;
      const p = hourly.precipitation_probability?.[i] ?? 0;
      const c = hourly.weathercode?.[i] ?? 0;
      if (p > precipProb) precipProb = p;
      if (c > weatherCode) weatherCode = c;
    }
    return {
      weatherCode,
      precipProb,
      avoidOutdoor: seen && (precipProb >= AVOID_PRECIP_PROB || weatherCode >= AVOID_WEATHER_CODE),
    };
  };

  return {
    morning: buildPart(DAY_PARTS.morning),
    afternoon: buildPart(DAY_PARTS.afternoon),
    evening: buildPart(DAY_PARTS.evening),
  };
}

/**
 * Günlük özet + gün-parçası (sabah/öğlen/akşam) yağış-duyarlı tahmin.
 * Mevcut getWeatherForecast'i bozmadan ek bilgi sağlar.
 * @returns {{ daily: Array, weatherDayParts: Array }|null}
 */
async function getWeatherWithDayParts(lat, lng, startDate, endDate) {
  try {
    const response = await axios.get(OPEN_METEO_URL, {
      params: {
        latitude: lat,
        longitude: lng,
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode',
        hourly: 'precipitation_probability,precipitation,weathercode',
        start_date: startDate,
        end_date: endDate,
        timezone: 'auto',
      },
      timeout: 5000,
    });

    const { daily, hourly } = response.data;
    if (!daily || !daily.time) return null;

    const dailyArr = daily.time.map((date, i) => ({
      date,
      tempMax: daily.temperature_2m_max[i],
      tempMin: daily.temperature_2m_min[i],
      precipitation: daily.precipitation_sum[i],
      weatherCode: daily.weathercode[i],
    }));

    let weatherDayParts = null;
    if (hourly && hourly.time) {
      weatherDayParts = daily.time.map((date) => {
        const parts = buildPartsForDate(date, hourly);
        return { date, ...parts };
      });
    }

    return { daily: dailyArr, weatherDayParts };
  } catch {
    return null;
  }
}

module.exports = { getWeatherForecast, getWeatherWithDayParts };
