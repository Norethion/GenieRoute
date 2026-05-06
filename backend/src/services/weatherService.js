const axios = require('axios');

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch weather forecast from Open-Meteo API
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

module.exports = { getWeatherForecast };
