// An error that carries the HTTP status we want to send back, and an optional short code the app can act on.
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = { HttpError };
