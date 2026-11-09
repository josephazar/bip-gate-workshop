// Google gives the app an ID token (a JWT signed by Google). We check it here, on the server.
const { OAuth2Client } = require('google-auth-library');
const { googleClientIds } = require('../config');
const { HttpError } = require('./errors');

const client = new OAuth2Client();

async function verifyGoogleIdToken(idToken) {
  if (googleClientIds.length === 0) {
    throw new HttpError(503, 'Google sign-in is not configured on this server. Email and password still work.');
  }
  if (typeof idToken !== 'string' || idToken.length > 10000) {
    throw new HttpError(400, 'Send the Google ID token as { "idToken": "..." }.');
  }

  let payload;
  try {
    // Checks Google's signature, the issuer, the expiry, and that the token was made for OUR client ID.
    const ticket = await client.verifyIdToken({ idToken, audience: googleClientIds });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Google did not accept this token.');
  }

  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new HttpError(401, 'A Google account with a verified email is required.');
  }
  return payload;   // sub = Google's stable id for the person
}

module.exports = { verifyGoogleIdToken };
