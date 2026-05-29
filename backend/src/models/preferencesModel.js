const pool = require('../config/db');

async function getPreferences(clientUuid) {
  const result = await pool.query(
    `SELECT prefs FROM user_preferences WHERE client_uuid = $1`,
    [clientUuid]
  );
  return result.rows[0]?.prefs ?? null;
}

// client_uuid başına tek satır — idempotent upsert.
async function upsertPreferences(clientUuid, prefs) {
  const result = await pool.query(
    `INSERT INTO user_preferences (client_uuid, prefs, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (client_uuid) DO UPDATE SET
       prefs = EXCLUDED.prefs,
       updated_at = NOW()
     RETURNING prefs`,
    [clientUuid, JSON.stringify(prefs)]
  );
  return result.rows[0].prefs;
}

module.exports = {
  getPreferences,
  upsertPreferences,
};
