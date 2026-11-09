-- STEP 7 · Forgot password: a one-time code sent to the person's email.
-- Like refresh tokens, the table keeps only a hash of the code, never the code itself.
-- A code works once, for 15 minutes, and five wrong guesses kill it.

CREATE TABLE IF NOT EXISTS password_reset_codes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT        NOT NULL,                  -- a keyed hash of the 6 digits
  expires_at  TIMESTAMPTZ NOT NULL,                  -- 15 minutes after it was sent
  attempts    INTEGER     NOT NULL DEFAULT 0,        -- guesses so far, right or wrong
  used_at     TIMESTAMPTZ,                           -- set the moment the code is accepted
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_codes_user_idx ON password_reset_codes (user_id);
