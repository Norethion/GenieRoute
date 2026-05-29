const pool = require('../config/db');

// Favori ekle/güncelle — aynı (client_uuid, place_id) için idempotent.
async function addFavorite({ clientUuid, placeId, name, category, city, lat, lng, rating }) {
  const result = await pool.query(
    `INSERT INTO place_favorites (client_uuid, place_id, name, category, city, lat, lng, rating)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (client_uuid, place_id) DO UPDATE SET
       name = EXCLUDED.name,
       category = EXCLUDED.category,
       city = EXCLUDED.city,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       rating = EXCLUDED.rating
     RETURNING *`,
    [clientUuid, placeId, name, category || null, city || null, lat ?? null, lng ?? null, rating ?? null]
  );
  return result.rows[0];
}

// Favori sil — yoksa null döner (route 404 verir).
async function removeFavorite({ clientUuid, placeId }) {
  const result = await pool.query(
    `DELETE FROM place_favorites WHERE client_uuid = $1 AND place_id = $2 RETURNING id`,
    [clientUuid, placeId]
  );
  return result.rows[0] || null;
}

async function listFavorites(clientUuid) {
  const result = await pool.query(
    `SELECT * FROM place_favorites WHERE client_uuid = $1 ORDER BY created_at DESC`,
    [clientUuid]
  );
  return result.rows;
}

// Affinity için: kategori ve şehir bazında beğeni sayıları.
async function getFavoriteStats(clientUuid) {
  const [byCatRes, byCityRes] = await Promise.all([
    pool.query(
      `SELECT category, COUNT(*)::int AS n FROM place_favorites
       WHERE client_uuid = $1 AND category IS NOT NULL GROUP BY category`,
      [clientUuid]
    ),
    pool.query(
      `SELECT city, COUNT(*)::int AS n FROM place_favorites
       WHERE client_uuid = $1 AND city IS NOT NULL GROUP BY city`,
      [clientUuid]
    ),
  ]);

  const byCategory = {};
  let total = 0;
  for (const row of byCatRes.rows) {
    byCategory[row.category] = row.n;
    total += row.n;
  }
  const byCity = {};
  for (const row of byCityRes.rows) {
    byCity[row.city] = row.n;
  }
  return { byCategory, byCity, total };
}

module.exports = {
  addFavorite,
  removeFavorite,
  listFavorites,
  getFavoriteStats,
};
