const pool = require('../config/db');

async function getPricesRow(cityKey, budgetLevel) {
  const result = await pool.query(
    `SELECT city_key, city_display, country_code, currency_code, budget_level,
            samples, merged, sample_count
       FROM city_prices_cache
      WHERE city_key = $1 AND budget_level = $2`,
    [cityKey, budgetLevel]
  );
  return result.rows[0] || null;
}

async function upsertPrices({ cityKey, cityDisplay, countryCode, currencyCode, budgetLevel, samples, merged }) {
  const result = await pool.query(
    `INSERT INTO city_prices_cache
       (city_key, city_display, country_code, currency_code, budget_level, samples, merged, sample_count, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, NOW())
     ON CONFLICT (city_key, budget_level) DO UPDATE SET
       city_display = EXCLUDED.city_display,
       country_code = EXCLUDED.country_code,
       currency_code = EXCLUDED.currency_code,
       samples = EXCLUDED.samples,
       merged = EXCLUDED.merged,
       sample_count = EXCLUDED.sample_count,
       updated_at = NOW()
     RETURNING *`,
    [
      cityKey,
      cityDisplay,
      countryCode,
      currencyCode,
      budgetLevel,
      JSON.stringify(samples),
      JSON.stringify(merged),
      samples.length,
    ]
  );
  return result.rows[0];
}

async function getTipsRow(cityKey) {
  const result = await pool.query(
    `SELECT city_key, city_display, country_code,
            samples, merged, sample_count
       FROM city_tips_cache
      WHERE city_key = $1`,
    [cityKey]
  );
  return result.rows[0] || null;
}

async function upsertTips({ cityKey, cityDisplay, countryCode, samples, merged }) {
  const result = await pool.query(
    `INSERT INTO city_tips_cache
       (city_key, city_display, country_code, samples, merged, sample_count, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NOW())
     ON CONFLICT (city_key) DO UPDATE SET
       city_display = EXCLUDED.city_display,
       country_code = EXCLUDED.country_code,
       samples = EXCLUDED.samples,
       merged = EXCLUDED.merged,
       sample_count = EXCLUDED.sample_count,
       updated_at = NOW()
     RETURNING *`,
    [
      cityKey,
      cityDisplay,
      countryCode,
      JSON.stringify(samples),
      JSON.stringify(merged),
      samples.length,
    ]
  );
  return result.rows[0];
}

async function getAllPricesRows() {
  const result = await pool.query(
    `SELECT city_key, city_display, country_code, currency_code, budget_level,
            samples, merged, sample_count, created_at, updated_at
       FROM city_prices_cache
      ORDER BY updated_at DESC, city_key ASC, budget_level ASC`
  );
  return result.rows;
}

async function getAllTipsRows() {
  const result = await pool.query(
    `SELECT city_key, city_display, country_code, sample_count,
            samples, merged, created_at, updated_at
       FROM city_tips_cache
      ORDER BY updated_at DESC, city_key ASC`
  );
  return result.rows;
}

async function getMustSeeRow(cityKey) {
  const result = await pool.query(
    `SELECT city_key, city_display, country_code,
            iconic_names, curated_names, source, created_at, updated_at
       FROM city_must_see_cache
      WHERE city_key = $1`,
    [cityKey]
  );
  return result.rows[0] || null;
}

async function upsertMustSee({ cityKey, cityDisplay, countryCode, iconicNames, curatedNames, source }) {
  const result = await pool.query(
    `INSERT INTO city_must_see_cache
       (city_key, city_display, country_code, iconic_names, curated_names, source, updated_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, NOW())
     ON CONFLICT (city_key) DO UPDATE SET
       city_display = EXCLUDED.city_display,
       country_code = EXCLUDED.country_code,
       iconic_names = EXCLUDED.iconic_names,
       curated_names = EXCLUDED.curated_names,
       source = EXCLUDED.source,
       updated_at = NOW()
     RETURNING *`,
    [
      cityKey,
      cityDisplay,
      countryCode,
      JSON.stringify(iconicNames || []),
      JSON.stringify(curatedNames || []),
      source || 'llm',
    ]
  );
  return result.rows[0];
}

module.exports = {
  getPricesRow,
  upsertPrices,
  getTipsRow,
  upsertTips,
  getAllPricesRows,
  getAllTipsRows,
  getMustSeeRow,
  upsertMustSee,
};
