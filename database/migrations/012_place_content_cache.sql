-- Mekan açıklaması cache'i (Wikipedia/Wikivoyage). Mekana tıklanınca tembel
-- yüklenir; aynı (mekan, dil) için tekrar API'ye gidilmez. Atıf kaynağa görünür
-- link ile sağlanır (CC BY-SA). Yorum/puan tutmaz — onu Google Places verir.

CREATE TABLE IF NOT EXISTS place_content_cache (
  id          SERIAL PRIMARY KEY,
  place_key   TEXT NOT NULL UNIQUE,   -- normalizeName(name) + ':' + lang
  name        TEXT NOT NULL,
  lang        VARCHAR(5) NOT NULL,
  extract     TEXT,
  thumb_url   TEXT,
  source      TEXT,                   -- 'wikipedia' | 'wikivoyage'
  source_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_place_content_key ON place_content_cache (place_key);
