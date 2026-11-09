// npm run decode -- <token>     prints the header and the payload of a JWT. No key needed: they are only encoded.
const [token] = process.argv.slice(2);
if (!token || token.split('.').length !== 3) {
  console.error('Usage: npm run decode -- <token>');
  process.exit(1);
}
const part = (i) => JSON.parse(Buffer.from(token.split('.')[i], 'base64url').toString());
console.log('header ', part(0));
console.log('payload', part(1));
console.log('(Decoding is not verifying: only the server, with JWT_SECRET, can check the signature.)');
