const express = require('express');
const router = express.Router();
const cityDataModel = require('../models/cityDataModel');
const { computeFromStructure, computeDailyRange } = require('../services/budgetService');

// Bozuk sample'da hata fırlatmak yerine null döndürür ki tek bir kötü satır
// admin panelini bozmasın.
function deriveStats(row) {
  const samples = Array.isArray(row.samples) ? row.samples : [];
  const range = computeDailyRange(samples, row.budget_level);

  let median = null;
  try {
    if (row.merged) {
      median = Math.round(computeFromStructure(row.merged, row.budget_level).dailyTotal);
    }
  } catch {
    median = null;
  }

  return { median, range };
}

// Pagination yok: cache satır sayısı sınırlı (~150 prices, ~50 tips).
router.get('/cities', async (req, res, next) => {
  try {
    const [pricesRows, tipsRows] = await Promise.all([
      cityDataModel.getAllPricesRows(),
      cityDataModel.getAllTipsRows(),
    ]);

    const prices = pricesRows.map((row) => {
      const { median, range } = deriveStats(row);
      return {
        cityKey: row.city_key,
        cityDisplay: row.city_display,
        countryCode: row.country_code,
        currencyCode: row.currency_code,
        budgetLevel: row.budget_level,
        sampleCount: row.sample_count,
        median,
        range,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    const tips = tipsRows.map((row) => {
      const merged = row.merged || {};
      const categoriesEn = merged.en ? Object.keys(merged.en) : [];
      const categoriesTr = merged.tr ? Object.keys(merged.tr) : [];
      return {
        cityKey: row.city_key,
        cityDisplay: row.city_display,
        countryCode: row.country_code,
        sampleCount: row.sample_count,
        categoriesEn,
        categoriesTr,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    res.json({
      prices,
      tips,
      summary: {
        totalPriceRows: prices.length,
        totalTipsRows: tips.length,
        totalSamples: prices.reduce((acc, p) => acc + (p.sampleCount || 0), 0)
          + tips.reduce((acc, t) => acc + (t.sampleCount || 0), 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
