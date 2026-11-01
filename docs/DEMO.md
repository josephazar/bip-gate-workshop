# Instructor demo — 12 minutes

Before class: start PostgreSQL, API and Flutter. Use a synthetic account. For Google, configure the provider client and approved origin before the lecture. Keep terminal and browser ready; students only watch.

1. **Register** from Flutter. Show a valid `/me` response without a password hash.
2. **Test admin API** as the normal user: expect 403. Explain why a UI button is not the policy.
3. Run `npm run promote -- demo@example.test` in `api/`; retry and show the user list. Do not use real student records during projection.
4. **Rotate refresh token**. In the database, show only column names and `used_at`/expiry, never actual credentials. Explain why only hashes are retained.
5. **Sign out**. An old access JWT now fails because its session was revoked. Use the integration test output to demonstrate old-refresh reuse without pasting real tokens into an external website.
6. Sign in with Google, or explicitly state that the account-specific Google setup is still pending. Trace `/auth/google`, then demonstrate explicit linking to a password account if configured.
7. Show `client/lib/session.dart`: one shared refresh future, one retry, mobile secure storage and memory-only web tokens.

Fallback: the synchronized Room demonstrations cover JWT tampering, SQL parameters and client-side role checks even if external identity services are unavailable. Keep the QCM time intact; skip optional setup work during class.
