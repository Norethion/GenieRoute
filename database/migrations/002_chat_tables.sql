-- Migration 002: Chat geçmişi ve plan değişiklik takibi (Faz 7c)

CREATE TABLE IF NOT EXISTS chat_sessions (
    id SERIAL PRIMARY KEY,
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    client_uuid VARCHAR(64),
    language VARCHAR(10) DEFAULT 'en',
    created_at TIMESTAMP DEFAULT NOW(),
    last_activity TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    tokens_used INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_updates (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE NOT NULL,
    message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
    trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE NOT NULL,
    action VARCHAR(50) NOT NULL,
    day_number INTEGER,
    time_slot VARCHAR(20),
    changes_json JSONB NOT NULL,
    applied_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_trip ON chat_sessions(trip_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_client ON chat_sessions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_trip_client ON chat_sessions(trip_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_plan_updates_trip ON plan_updates(trip_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_updates_session ON plan_updates(session_id);
