const pool = require('../config/db');

// Trip + client UUID için session bul ya da oluştur (UPSERT pattern)
async function getOrCreateSession({ tripId, clientUuid, language = 'en' }) {
  if (!tripId) throw new Error('tripId is required');

  if (clientUuid) {
    const existing = await pool.query(
      `SELECT * FROM chat_sessions WHERE trip_id = $1 AND client_uuid = $2 LIMIT 1`,
      [tripId, clientUuid]
    );
    if (existing.rows[0]) {
      // last_activity güncelle
      await pool.query(
        `UPDATE chat_sessions SET last_activity = NOW() WHERE id = $1`,
        [existing.rows[0].id]
      );
      return existing.rows[0];
    }
  }

  const created = await pool.query(
    `INSERT INTO chat_sessions (trip_id, client_uuid, language)
     VALUES ($1, $2, $3) RETURNING *`,
    [tripId, clientUuid || null, language]
  );
  return created.rows[0];
}

async function saveMessage({ sessionId, role, content, tokensUsed }) {
  const result = await pool.query(
    `INSERT INTO chat_messages (session_id, role, content, tokens_used)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [sessionId, role, content, tokensUsed || null]
  );
  return result.rows[0];
}

async function getRecentMessages(sessionId, limit = 50) {
  const result = await pool.query(
    `SELECT id, role, content, created_at
     FROM chat_messages
     WHERE session_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [sessionId, limit]
  );
  return result.rows;
}

// Asistan mesajlari + plan_updates JOIN ile her mesajin applied durumunu döner.
// Mesaj id -> { applied: bool } map'i.
async function getAppliedStatusMap(sessionId) {
  const result = await pool.query(
    `SELECT message_id, applied FROM plan_updates
     WHERE session_id = $1 AND message_id IS NOT NULL`,
    [sessionId]
  );
  const map = {};
  for (const row of result.rows) {
    map[row.message_id] = row.applied;
  }
  return map;
}

async function markPlanUpdateApplied(messageId) {
  if (!messageId) return null;
  const result = await pool.query(
    `UPDATE plan_updates SET applied = TRUE, applied_actually_at = NOW()
     WHERE message_id = $1 RETURNING *`,
    [messageId]
  );
  return result.rows[0] || null;
}

async function savePlanUpdate({ sessionId, messageId, tripId, update }) {
  const result = await pool.query(
    `INSERT INTO plan_updates (session_id, message_id, trip_id, action, day_number, time_slot, changes_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      sessionId,
      messageId || null,
      tripId,
      update.action,
      update.day || null,
      update.time || null,
      JSON.stringify(update),
    ]
  );
  return result.rows[0];
}

async function getPlanUpdatesForTrip(tripId) {
  const result = await pool.query(
    `SELECT * FROM plan_updates WHERE trip_id = $1 ORDER BY applied_at DESC`,
    [tripId]
  );
  return result.rows;
}

async function updateLastActivity(sessionId) {
  await pool.query(`UPDATE chat_sessions SET last_activity = NOW() WHERE id = $1`, [sessionId]);
}

// Bir oturumun tüm mesajlarını ve plan-update'lerini sil — kullanıcı "yeni sohbet" derse
// session_id korunur ama içeriği temizlenir; böylece tarayıcıdan refresh sonrası eski
// mesajlar geri gelmez.
async function clearSession(sessionId) {
  // plan_updates'ler ON DELETE SET NULL kuralı ile message_id'yi null'a düşürür,
  // mesaj silimini engellemez. Plan_updates'i de temizleyelim.
  await pool.query(`DELETE FROM plan_updates WHERE session_id = $1`, [sessionId]);
  await pool.query(`DELETE FROM chat_messages WHERE session_id = $1`, [sessionId]);
  await pool.query(`UPDATE chat_sessions SET last_activity = NOW() WHERE id = $1`, [sessionId]);
}

module.exports = {
  getOrCreateSession,
  saveMessage,
  getRecentMessages,
  getAppliedStatusMap,
  savePlanUpdate,
  markPlanUpdateApplied,
  getPlanUpdatesForTrip,
  updateLastActivity,
  clearSession,
};
