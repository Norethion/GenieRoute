-- Migration 003: Türkiye dışı şehirler için LLM-üretimli bütçe ve ipuçları cache'i
-- 3-örnek ensemble: aynı şehir 3 farklı isteğe kadar yeni LLM örneği üretir;
-- prices.merged median ile, tips.merged en son örnek olarak hesaplanır.

CREATE TABLE IF NOT EXISTS city_prices_cache (
    id SERIAL PRIMARY KEY,
    city_key VARCHAR(120) UNIQUE NOT NULL,
    city_display VARCHAR(150) NOT NULL,
    country_code CHAR(2),
    currency_code CHAR(3),
    samples JSONB NOT NULL DEFAULT '[]'::jsonb,
    merged JSONB,
    sample_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS city_tips_cache (
    id SERIAL PRIMARY KEY,
    city_key VARCHAR(120) UNIQUE NOT NULL,
    city_display VARCHAR(150) NOT NULL,
    country_code CHAR(2),
    samples JSONB NOT NULL DEFAULT '[]'::jsonb,
    merged JSONB,
    sample_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_city_prices_key ON city_prices_cache(city_key);
CREATE INDEX IF NOT EXISTS idx_city_tips_key ON city_tips_cache(city_key);
