-- Google Places / Geocoding / Photo proxy çağrılarının lokal sayacı.
-- Cloud Monitoring API'siyle yan yana doğrulama amaçlı; OpenAI tarafı
-- buradan değil OpenAI Admin API'den okunur (resmi USD verisi orada).

CREATE TABLE IF NOT EXISTS api_usage_log (
  id BIGSERIAL PRIMARY KEY,
  service VARCHAR(48) NOT NULL,
  endpoint VARCHAR(128),
  status_code INT,
  response_ms INT,
  meta JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_created
  ON api_usage_log (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_service_created
  ON api_usage_log (service, created_at DESC);
