CREATE TABLE IF NOT EXISTS gate_users (
 id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT, google_sub TEXT UNIQUE,
 role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gate_sessions (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES gate_users(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS gate_refresh_tokens (
 token_hash TEXT PRIMARY KEY, session_id UUID NOT NULL REFERENCES gate_sessions(id) ON DELETE CASCADE,
 expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gate_session_user_idx ON gate_sessions(user_id);
