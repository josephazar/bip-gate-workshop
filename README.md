# The Gate — BIP 2026 workshop

A complete, runnable **user authentication system**, built top-down in nine steps:
a **Flutter** app, a **Node.js + Express** API and a **PostgreSQL** database, with sign-in by
**email and password** or by **Google**, and **JWT** access tokens. It runs on your own computer.

```
Flutter app  ──HTTPS──▶  Node.js API  ──SQL──▶  PostgreSQL
     │                       ▲
     └──── Google ID token ──┘   (the API checks it, then issues its own tokens)
```

## Run it (one script)

You need Node.js 22+, PostgreSQL, and Flutter with an Android emulator.

```sh
./start.sh        # database + API + emulator + app   (hot reload: r / R / q)
./stop.sh         # stops the app, the API and the emulator that start.sh opened
```

On macOS you can double-click `START-GATE.command` and `STOP-GATE.command` in the course folder instead.
`./start.sh api` starts only the API (http://localhost:3220). The script never resets or drops a database,
creates `api/.env` with a fresh `JWT_SECRET` only if it is missing, and never touches PostgreSQL itself.
Slow emulator? `EMULATOR_ARGS="-gpu host" ./start.sh`. Logs are in `.run/`.

## The nine steps (the slides follow the same order)

| # | Step | Where | Try it |
|---|---|---|---|
| 1 | Tables | `database/01_users.sql` | `createdb bip_gate && psql bip_gate -f database/01_users.sql` |
| 2 | API skeleton | `api/src/server.js`, `app.js`, `config.js`, `db.js` | `cd api && npm install && npm start`, then `curl localhost:3220/healthz` |
| 3 | Register | `routes/auth.js`, `lib/passwords.js`, `lib/users.js` | `curl -X POST localhost:3220/auth/register …` |
| 4 | Login and the JWT | `lib/tokens.js` | `curl … /auth/login`, then `npm run decode -- <accessToken>` |
| 5 | The keeper | `middleware/requireAuth.js`, `routes/me.js` | `GET /me` 200, `/admin/users` 403, `npm run promote -- you@example.com` |
| 6 | Stay signed in | `database/02_refresh_tokens.sql`, `rotateRefreshToken` | refresh once, replay the old token |
| 7 | Google | `lib/google.js`, `POST /auth/google` | put the client ID in `api/.env` |
| 8 | The Flutter app | `client/lib`: `models/`, `services/`, `screens/` | `./start.sh` |
| 9 | One script | `start.sh`, `stop.sh` | `cd api && DATABASE_URL=postgres://localhost/bip_gate_qa npm test` |

## Design in one page

- **Two tables.** `users` (email, name, Argon2id hash or Google subject, role) and `refresh_tokens` (SHA-256 hash, absolute expiry, used-at).
- **Access token:** a JWT signed with HS256, 15 minutes (`ACCESS_TOKEN_SECONDS`). Claims: `sub`, `role`, `iss`, `aud`, `iat`, `exp`.
- **The role comes from the database** on every protected request, never from the token.
- **Refresh token:** 32 random bytes, 7-day absolute limit, valid once. Reuse deletes all refresh tokens of that user.
- **Logout** deletes the refresh token. An access token already issued works until it expires (15 minutes): that is the price of a token the server does not look up. A sessions table would make it immediate (see the Going further slides).
- **Google:** the app gets an ID token from Google; the API verifies signature, issuer, expiry and audience, requires a verified email and keys the account on Google's `sub`. A Google email that matches a password account is refused with 409 (no merge on an email match alone).
- **Login** answers the same message and takes the same time for an unknown email and a wrong password. Register, login and Google are limited to 20 attempts per 15 minutes per address.

## API

| Route | Behaviour |
|---|---|
| `POST /auth/register` | `{name, email, password}` → normal user + tokens. A submitted role is ignored. |
| `POST /auth/login` | `{email, password}` → tokens |
| `POST /auth/google` | `{idToken}` → tokens (503 if `GOOGLE_CLIENT_IDS` is not set) |
| `POST /auth/refresh` | `{refreshToken}` → a new pair; the old token stops working |
| `POST /auth/logout` | `{refreshToken}` → 204 |
| `GET /me` | the signed-in user |
| `GET /admin/users` | admins only (403 for everyone else) |
| `GET /healthz` | database-backed readiness |

## Google sign-in (optional)

1. In Google Cloud create a project, the consent screen (External, Testing, add yourself as a test user) and an OAuth client of type **Web application**.
2. Put its client ID in `api/.env`: `GOOGLE_CLIENT_IDS="<id>.apps.googleusercontent.com"`. It is a public identifier, not a secret.
3. For Android, add a second OAuth client of type **Android**: package `com.example.gate_client` and the SHA-1 of your signing key
   (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey`, password `android`).
4. `./start.sh` passes the same web client ID to the app as `--dart-define=GOOGLE_WEB_CLIENT_ID=…`. Use an emulator image with Google Play and sign in to a Google account in it.

The Google sign-in itself needs your own account and an interactive window, so the automated tests replace Google's signature check with a stub.

## Tests

```sh
createdb bip_gate_qa
cd api    && DATABASE_URL=postgres://localhost/bip_gate_qa npm test      # 11 tests: tokens, roles, refresh, Google rules
cd client && flutter analyze && flutter test                             # 10 tests: claims, errors, refresh once
```

The API tests forge, expire, re-sign, strip and replace the algorithm of tokens, replay a refresh token, race two refreshes, and check that a Google email never merges into a password account.

## What this workshop leaves out on purpose

Password reset, email verification, MFA and passkeys, an audit log, per-device session lists, immediate revocation of access tokens, and a production deployment (HTTPS, secrets management, a proxy and `trust proxy`). The slides in the Going further section explain each one.

## References

- [Google: verify an ID token on the backend](https://developers.google.com/identity/sign-in/web/backend-auth)
- [google_sign_in](https://pub.dev/packages/google_sign_in) · [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage)
- [OAuth 2.0 Security Best Current Practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Bundled Noto Sans fonts are under the SIL Open Font License (`client/assets/fonts/`).
