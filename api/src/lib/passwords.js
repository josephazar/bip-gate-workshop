// Passwords are stored as Argon2id hashes: slow on purpose, salted automatically.
const argon2 = require('argon2');

const OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const hashPassword = (password) => argon2.hash(password, OPTIONS);

// Used when the email is unknown, so a wrong email costs the same time as a wrong password.
const dummyHash = argon2.hash('this is not anybody\'s password', OPTIONS);

async function verifyPassword(storedHash, password) {
  const matches = await argon2.verify(storedHash || (await dummyHash), password);
  return Boolean(storedHash) && matches;
}

module.exports = { hashPassword, verifyPassword };
