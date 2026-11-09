// Sending email. Your own computer has no mail server, so without SMTP_URL the email is
// printed in the API log instead. That is how you read the reset code while you build.
const config = require('../config');

const outbox = [];   // the last few emails, kept in memory so the tests can read them

async function sendMail({ to, subject, text }) {
  if (!config.smtpUrl) {
    outbox.push({ to, subject, text });
    if (outbox.length > 20) outbox.shift();
    console.log(`\n── EMAIL (printed, not sent: SMTP_URL is empty) ──\nTo: ${to}\nSubject: ${subject}\n\n${text}\n──\n`);
    return;
  }
  const nodemailer = require('nodemailer');   // loaded only when a real mail server is configured
  await nodemailer.createTransport(config.smtpUrl).sendMail({ from: config.mailFrom, to, subject, text });
}

module.exports = { sendMail, outbox };
