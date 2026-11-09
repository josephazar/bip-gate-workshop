-- STEP 6 · Refresh tokens: a new access token without asking for the password again.
-- We never store the token itself, only its SHA-256 hash (like a password).

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,                  -- absolute end of the sign-in (7 days)
  used_at     TIMESTAMPTZ,                           -- set when the token is exchanged
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refresh_tokens_user_idx ON refresh_tokens (user_id);
