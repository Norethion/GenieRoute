-- Sunucu tarafı favoriler. Gerçek hesap yok; client_uuid kullanıcı vekili
-- (chat_sessions ile aynı anahtar). Haritada beğenilen mekanlar burada tutulur ve
-- yeni plan üretiminde affinity (filterService sıralama boost'u) için sorgulanır.

CREATE TABLE IF NOT EXISTS place_favorites (
  id           SERIAL PRIMARY KEY,
  client_uuid  TEXT NOT NULL,
  place_id     TEXT NOT NULL,
  name         TEXT NOT NULL,
  category     TEXT,
  city         TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  rating       REAL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_uuid, place_id)
);

CREATE INDEX IF NOT EXISTS idx_place_favorites_client ON place_favorites (client_uuid);
CREATE INDEX IF NOT EXISTS idx_place_favorites_client_cat ON place_favorites (client_uuid, category);
