-- Migration 005: city_prices_cache anahtar tipi (city_key) → (city_key, budget_level).
-- Aynı şehir için low/medium/high bağımsız sample havuzlarına ayrılır; her birinin
-- kendi sample_count'u, samples[]'ı ve merged median'ı vardır. Tips cache budget'a
-- bağlı olmadığı için değişmez.

ALTER TABLE city_prices_cache
  DROP CONSTRAINT IF EXISTS city_prices_cache_city_key_key;

ALTER TABLE city_prices_cache
  ADD COLUMN IF NOT EXISTS budget_level VARCHAR(10) NOT NULL DEFAULT 'medium';

ALTER TABLE city_prices_cache
  ADD CONSTRAINT city_prices_cache_city_budget_uniq UNIQUE (city_key, budget_level);

-- Eski tek satırlık endeks artık composite key'in altında otomatik kapsanıyor
DROP INDEX IF EXISTS idx_city_prices_key;
CREATE INDEX IF NOT EXISTS idx_city_prices_lookup ON city_prices_cache (city_key, budget_level);
