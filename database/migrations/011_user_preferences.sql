-- Sunucu tarafı kullanıcı tercihleri (client_uuid başına tek satır). Alanlar
-- liste-ağırlıklı ve zamanla genişleyebilir; cache tablolarının jsonb stiline uygun
-- olarak tek JSONB 'prefs' kolonunda tutulur. dietary[] ve accessibility[] LLM
-- prompt'unu besler; favoriteCategories ek olarak affinity için kullanılabilir.

CREATE TABLE IF NOT EXISTS user_preferences (
  id           SERIAL PRIMARY KEY,
  client_uuid  TEXT NOT NULL UNIQUE,
  prefs        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_client ON user_preferences (client_uuid);
