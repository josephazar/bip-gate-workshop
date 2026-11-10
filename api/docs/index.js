// The API documentation: the Swagger page at /docs and the OpenAPI file it reads at /openapi.yaml.
// The page loads Swagger UI from a CDN (see index.html), so nothing is added to package.json.
const express = require('express');

const router = express.Router();

// helmet's default policy blocks scripts from other sites. This page may load ONE script and ONE style sheet
// from the CDN (the browser also checks their hash), and nothing else.
const policy = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join('; ');

router.use(['/docs', '/openapi.yaml'], (req, res, next) => {
  res.set('Content-Security-Policy', policy);
  res.set('Cache-Control', 'no-cache');
  next();
});

const file = (name) => (req, res) => res.sendFile(name, { root: __dirname });
router.get('/docs', file('index.html'));
router.get('/docs/init.js', file('init.js'));
router.get('/openapi.yaml', file('openapi.yaml'));

module.exports = router;
