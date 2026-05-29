const pool = require('../config/db');

// place_key = normalizeName(name) + ':' + lang — TR ve EN ayrı satır.
async function getContent(placeKey) {
  const result = await pool.query(
    `SELECT place_key, name, lang, extract, thumb_url, source, source_url
       FROM place_content_cache
      WHERE place_key = $1`,
    [placeKey]
  );
  return result.rows[0] || null;
}

// (place_key) tekil — idempotent upsert.
async function upsertContent({ placeKey, name, lang, extract, thumbUrl, source, sourceUrl }) {
  const result = await pool.query(
    `INSERT INTO place_content_cache
       (place_key, name, lang, extract, thumb_url, source, source_url, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (place_key) DO UPDATE SET
       name = EXCLUDED.name,
       extract = EXCLUDED.extract,
       thumb_url = EXCLUDED.thumb_url,
       source = EXCLUDED.source,
       source_url = EXCLUDED.source_url,
       updated_at = NOW()
     RETURNING *`,
    [placeKey, name, lang, extract || null, thumbUrl || null, source || null, sourceUrl || null]
  );
  return result.rows[0];
}

module.exports = {
  getContent,
  upsertContent,
};
