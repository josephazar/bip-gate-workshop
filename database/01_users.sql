-- STEP 1 · The users table: one row per person who can sign in.
-- Run it:  psql bip_gate -f database/01_users.sql   (or: npm run db:setup)

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,         -- the "username"
  name          TEXT        NOT NULL,
  password_hash TEXT,                                -- Argon2id hash; NULL for Google-only people
  google_sub    TEXT        UNIQUE,                  -- Google's id for the person; NULL if no Google
  role          TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- every account needs at least one way to sign in
  CONSTRAINT has_a_sign_in_method CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL)
);
