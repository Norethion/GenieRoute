-- Migration 001: İlk şema (trips + saved_plans)

CREATE TABLE IF NOT EXISTS trips (
    id SERIAL PRIMARY KEY,
    city VARCHAR(100) NOT NULL,
    days INTEGER NOT NULL,
    budget VARCHAR(20) NOT NULL,
    interests JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saved_plans (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
    plan_text JSONB NOT NULL,
    places_json JSONB,
    restaurants_json JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
