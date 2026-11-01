# The Gate — BIP 2026 workshop

A runnable teaching example of authentication and server-side authorization using Flutter, Node.js and PostgreSQL. Builds on the earlier AuthCraftFlutter / user-auth-backend teaching project; this version replaces plaintext passwords and client-supplied user IDs with verified sessions.

## Run locally

Requires Node 22+, PostgreSQL, Flutter 3.35+ / Dart 3.9+. Tested on Flutter 3.35.7 and Node 24.20.0.

```sh
createdb bip_gate
cd api
npm ci
cp .env.example .env
```

Set `JWT_SECRET` in your local `.env` to a random value of at least 32 characters. A generator is `openssl rand -hex 32`. Never commit `.env`.

```sh
npm start
```

The API listens at `http://localhost:3220`. In another terminal:

```sh
cd client
flutter pub get
flutter run -d chrome --web-hostname localhost --web-port 8080 --dart-define=API_URL=http://localhost:3220
```

Docker alternative: set `POSTGRES_PASSWORD` and `JWT_SECRET` in a root `.env`, then `docker compose up --build`. Start Flutter separately. The compose database has no published port; only the API is bound to localhost.

## Observe the access boundary

Create a user with a password of 12–128 characters. `GET /me` succeeds. **Test admin API** returns **403** for a normal user. Registration ignores a submitted role.

```sh
cd api
npm run promote -- demo@example.test
```

Try the admin route again. The current database role is checked on every request; a stale role claim cannot override it. Instructor SQL can demote the demo user afterwards.

Access JWTs expire after 15 minutes. Refresh tokens are random, stored hashed, rotated atomically, and expire with the seven-day absolute session. Reuse revokes the session family. The API checks session revocation for each access JWT, so logout also blocks existing access tokens immediately. Flutter shares one in-flight refresh to prevent concurrent 401 responses from reusing a refresh token.

Native Android stores only the refresh token through `flutter_secure_storage`; access tokens stay in memory. Web stores both tokens only in memory, so reload signs out. This deliberately does not claim browser storage has Keystore guarantees. A production web alternative is a BFF with HttpOnly cookies and CSRF controls.

## Google Sign-In configuration

1. In Google Cloud, configure the consent screen and an OAuth **Web application** client. Add `http://localhost`, `http://localhost:8080` and the eventual deployed UI origin to its authorized JavaScript origins. If the consent app is in testing, add the instructor as a test user.
2. Set API `GOOGLE_CLIENT_IDS` to the accepted web client ID(s), separated by commas. These IDs are public identifiers, not client secrets.
3. Run Flutter with `--dart-define=GOOGLE_WEB_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com` as well as `API_URL`. Restart/rebuild after changing defines. The web UI uses the Google-rendered button and `authenticationEvents`, as required by google_sign_in v7.
4. For Android, add an Android OAuth client with package `com.example.gate_client` and your debug/release signing SHA-1/SHA-256 fingerprints. The SDK uses the web client ID as `serverClientId`. See the plugin setup reference before changing package/signing configuration.
5. Sign in. Flutter sends the ID token over HTTPS in a deployed environment. `google-auth-library` verifies signature, issuer, expiry and the configured audience. A verified provider subject is the stable identity. The API then issues its own application session.
6. An email match with an existing password account is **not** silently linked. Sign in to that existing account, select **Link the next Google sign-in to this account**, then complete the Google flow. An already-linked subject cannot be assigned elsewhere.

No OAuth client secret belongs in Flutter. This is a Google SDK ID-token exchange, not a generic OAuth authorization server. The lecture also explains authorization code with PKCE for public native clients.

The positive Google flow requires account-specific provider configuration and an interactive sign-in. It is not faked by the test suite. Password flows remain usable when Google is unconfigured; the API returns an explicit 503 for Google login in that state.

## Tests and builds

Use a disposable test database; the test creates and removes its own synthetic user.

```sh
createdb bip_gate_qa
cd api
DATABASE_URL=postgres://localhost/bip_gate_qa JWT_SECRET=local-integration-secret-at-least-32-characters npm test
cd ../client
flutter analyze
flutter build web --release --no-web-resources-cdn
```

Integration checks cover hashing, invalid credentials, forged/expired JWTs, 401/403, attempted role escalation, role changes, rotation, replay, concurrent refreshes, revocation and unconfigured Google behavior. The web release build and static analysis are verified. The Docker daemon and Android emulator were unavailable during the handover verification, so Docker runtime and native Google sign-in still need their environment-specific rehearsal.

For Android emulator development, point the API at `http://10.0.2.2:3220` and allow that host only in the debug network-security configuration. Release clients use HTTPS; do not disable certificate validation. Android backup is disabled for the workshop secure-storage data.

## API routes

| Route | Behavior |
|---|---|
| `POST /auth/register` | Name, email, password → normal user + session |
| `POST /auth/login` | Password verification → session |
| `POST /auth/refresh` | Rotate one refresh credential |
| `POST /auth/logout` | Revoke the refresh session |
| `POST /auth/google` | Verify Google ID token → session |
| `POST /auth/google/link` | Authenticated explicit linking |
| `GET /me` | Verified active session required |
| `GET /admin/users` | Active session + current admin role required |
| `GET /healthz` | Database-backed readiness check |

This teaching repo omits password recovery, email verification, MFA, audit-event retention and a production secrets/deployment policy. Registration email ownership is not asserted by password registration. These are deliberate workshop boundaries, not security controls implemented elsewhere.

## References

- [Google backend ID-token verification](https://developers.google.com/identity/sign-in/web/backend-auth)
- [google_sign_in v7](https://pub.dev/packages/google_sign_in)
- [Web button and origins](https://pub.dev/packages/google_sign_in_web)
- [Android setup](https://pub.dev/packages/google_sign_in_android)
- [flutter_secure_storage](https://pub.dev/packages/flutter_secure_storage)
- [OAuth Security BCP, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

Bundled Noto Sans / Noto Sans Mono fonts are licensed under the SIL Open Font License; licenses are under `client/assets/fonts/`.
