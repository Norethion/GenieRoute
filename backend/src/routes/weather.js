const express = require('express');
const router = express.Router();
const weatherService = require('../services/weatherService');

// POST /api/weather - Koordinat + tarih aralığı için canlı tahmin (gün-parçalı).
// Kayıtlı gezi açıldığında hava verisi snapshot'tan değil buradan canlı çekilir.
router.post('/', async (req, res, next) => {
  try {
    const { lat, lng, startDate, endDate } = req.body;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ error: 'lat/lng must be numbers' });
    }
    const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: 'startDate/endDate must be YYYY-MM-DD' });
    }

    const w = await weatherService.getWeatherWithDayParts(latNum, lngNum, startDate, endDate);
    // Tahmin penceresi dışındaysa (Open-Meteo null döner) hava yok — 200 + null.
    res.json({ weather: w?.daily ?? null, weatherDayParts: w?.weatherDayParts ?? null });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
