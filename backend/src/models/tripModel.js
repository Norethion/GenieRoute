const pool = require('../config/db');

async function createTrip({ city, days, budget, interests, startDate, endDate }) {
  const result = await pool.query(
    'INSERT INTO trips (city, days, budget, interests, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [city, days, budget, JSON.stringify(interests), startDate || null, endDate || null]
  );
  return result.rows[0];
}

async function savePlan({ tripId, planText, placesJson, restaurantsJson, budgetEstimate, cityInfo }) {
  const result = await pool.query(
    `INSERT INTO saved_plans (trip_id, plan_text, places_json, restaurants_json, budget_estimate, city_info)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      tripId,
      planText,
      JSON.stringify(placesJson),
      JSON.stringify(restaurantsJson),
      budgetEstimate ? JSON.stringify(budgetEstimate) : null,
      cityInfo ? JSON.stringify(cityInfo) : null,
    ]
  );
  return result.rows[0];
}

async function getAllTrips() {
  // Tarihler to_char ile string olarak döner — pg'nin DATE→JS Date dönüşümündeki
  // saat dilimi kaymasını (toISOString) önler.
  const result = await pool.query(
    `SELECT t.*,
            to_char(t.start_date, 'YYYY-MM-DD') AS start_date_str,
            to_char(t.end_date, 'YYYY-MM-DD') AS end_date_str,
            sp.plan_text, sp.places_json, sp.restaurants_json,
            sp.budget_estimate, sp.city_info
     FROM trips t
     LEFT JOIN saved_plans sp ON sp.trip_id = t.id
     ORDER BY t.created_at DESC`
  );
  return result.rows;
}

async function getTripById(id) {
  const result = await pool.query(
    `SELECT t.*,
            to_char(t.start_date, 'YYYY-MM-DD') AS start_date_str,
            to_char(t.end_date, 'YYYY-MM-DD') AS end_date_str,
            sp.plan_text, sp.places_json, sp.restaurants_json,
            sp.budget_estimate, sp.city_info
     FROM trips t
     LEFT JOIN saved_plans sp ON sp.trip_id = t.id
     WHERE t.id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function updatePlan({ tripId, planText, placesJson, restaurantsJson, budgetEstimate, cityInfo }) {
  // budgetEstimate / cityInfo opsiyonel — chat ile yapılan plan güncellemelerinde
  // değişmediği için COALESCE ile mevcut değer korunur.
  const result = await pool.query(
    `UPDATE saved_plans
     SET plan_text = $2,
         places_json = $3,
         restaurants_json = $4,
         budget_estimate = COALESCE($5, budget_estimate),
         city_info = COALESCE($6, city_info)
     WHERE trip_id = $1
     RETURNING *`,
    [
      tripId,
      planText,
      JSON.stringify(placesJson),
      JSON.stringify(restaurantsJson),
      budgetEstimate ? JSON.stringify(budgetEstimate) : null,
      cityInfo ? JSON.stringify(cityInfo) : null,
    ]
  );
  return result.rows[0] || null;
}

module.exports = {
  createTrip,
  savePlan,
  updatePlan,
  getAllTrips,
  getTripById,
};
