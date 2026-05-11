-- Şehir bazlı must-see (iconic) ve curated (niche) yer listeleri için cache.
-- LLM-üretimli, Places lookup ile doğrulanmış kanonik isim listeleri tutulur.
-- filterService bu liste ile her aday yere "iconic / curated / regular" etiketi verir.
-- Etiket LLM plan üretiminde önceliklendirme için kullanılır.

CREATE TABLE IF NOT EXISTS city_must_see_cache (
  id            SERIAL PRIMARY KEY,
  city_key      TEXT NOT NULL UNIQUE,
  city_display  TEXT NOT NULL,
  country_code  CHAR(2),
  iconic_names  JSONB NOT NULL DEFAULT '[]'::jsonb,
  curated_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  source        TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_city_must_see_key ON city_must_see_cache (city_key);
