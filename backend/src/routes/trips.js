const express = require('express');
const router = express.Router();
const tripModel = require('../models/tripModel');

// POST /api/trips - Yeni trip kaydet
router.post('/', async (req, res, next) => {
  try {
    const { city, days, budget, interests, planText, placesJson, restaurantsJson, budgetEstimate, cityInfo, startDate, endDate } = req.body;

    // Sınır validasyonu — geçersiz girdi ham Postgres hatası olarak client'a sızmasın.
    if (typeof city !== 'string' || city.length < 1 || city.length > 100) {
      return res.status(400).json({ error: 'Invalid city' });
    }
    const daysNum = Number(days);
    if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 14) {
      return res.status(400).json({ error: 'days must be between 1 and 14' });
    }
    if (!['low', 'medium', 'high'].includes(budget)) {
      return res.status(400).json({ error: 'budget must be low, medium, or high' });
    }
    if (!Array.isArray(interests)) {
      return res.status(400).json({ error: 'interests must be an array' });
    }
    // Tarihler opsiyonel; verildiyse YYYY-MM-DD formatında olmalı (ham Postgres hatası sızmasın).
    const isValidDate = (d) => d == null || /^\d{4}-\d{2}-\d{2}$/.test(d);
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({ error: 'startDate/endDate must be YYYY-MM-DD' });
    }

    const trip = await tripModel.createTrip({ city, days: daysNum, budget, interests, startDate, endDate });
    await tripModel.savePlan({
      tripId: trip.id,
      planText,
      placesJson,
      restaurantsJson,
      budgetEstimate,
      cityInfo,
    });

    res.status(201).json({ trip });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips - Kayıtlı trip'leri listele
router.get('/', async (req, res, next) => {
  try {
    const trips = await tripModel.getAllTrips();
    res.json({ trips });
  } catch (err) {
    next(err);
  }
});

// PUT /api/trips/:id/plan - Mevcut planı güncelle (chat ile değiştirildiğinde)
router.put('/:id/plan', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid trip id' });
    }
    const { planText, placesJson, restaurantsJson, budgetEstimate, cityInfo } = req.body;
    const updated = await tripModel.updatePlan({ tripId: id, planText, placesJson, restaurantsJson, budgetEstimate, cityInfo });
    if (!updated) return res.status(404).json({ error: 'Plan not found' });
    res.json({ plan: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id - Tek trip detayı
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid trip id' });
    }
    const trip = await tripModel.getTripById(id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json({ trip });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
