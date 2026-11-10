# Questions and answers

The questions students ask most while they build the Gate. Each answer says what is wrong and what to type.
If your question is not here, read the last lines of `.run/api.log` first: the API writes its errors there.

- [Setting up](#setting-up)
- [Running the API](#running-the-api)
- [Passwords and email](#passwords-and-email)
- [Google sign-in](#google-sign-in)
- [The Flutter app](#the-flutter-app)
- [Design choices](#design-choices)
- [Tests](#tests)

## Setting up

### `createdb: command not found`

PostgreSQL's `bin` folder is not on your `PATH`, so the terminal cannot find its tools (`createdb`, `psql`, `pg_isready`). Open a new Terminal window after installing PostgreSQL, and if it still fails, add the folder yourself.
On macOS with Homebrew:

```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
```

Add that line to `~/.zshrc` to keep it in every new terminal. Check it worked:

```bash
pg_isready
```

It must say `accepting connections`. If the folder does not exist, run `brew --prefix postgresql@16` to find where PostgreSQL is installed, and use that path followed by `/bin`.
`./start.sh` creates the database `bip_gate` for you once these tools are found.

### `password authentication failed`

PostgreSQL asked for a user and a password, and the connection string did not have the right ones. Put your own in `api/.env`:

```bash
DATABASE_URL=postgres://YOUR_USER:YOUR_PASSWORD@localhost/bip_gate
```

On a default Homebrew install no password is needed and the line `DATABASE_URL=postgres://localhost/bip_gate` is enough. `api/.env` is created by `./start.sh` the first time; see step 2 of the build. Never commit that file.

### What if I use Windows or Linux?

The code is the same. The `start.sh` and `stop.sh` scripts are written for macOS and Linux. On Windows, use WSL, or run the same commands by hand: [Run it and test it](docs/run-and-test.md) lists what `start.sh` does, step by step.

## Running the API

### The API says `JWT_SECRET` is too short, or will not start

The server refuses to start without a secret of at least 32 random characters, and tells you why. Make one and put it in `api/.env`:

```bash
openssl rand -hex 32
```

```bash
JWT_SECRET=paste-the-64-characters-here
```

`./start.sh` writes a fresh `JWT_SECRET` into `api/.env` when the file is missing.

### Port 3220 is busy

Something else already uses the port. See what it is:

```bash
lsof -nP -iTCP:3220 -sTCP:LISTEN
```

Stop it (if it is an older copy of the Gate, `./stop.sh` does it), or start the Gate on another port. `./start.sh` gives both the API and the app that port:

```bash
PORT=3221 ./start.sh
```

Do not stop a process you do not recognise.

### `./start.sh` says something is already on port 3220

An older copy of the API is still running. Stop it, then start again:

```bash
./stop.sh
./start.sh
```

### Where are the logs?

In `.run/api.log` for the API and `.run/emulator.log` for the emulator, inside the `gate-workshop` folder. To follow the API log while you work:

```bash
tail -f .run/api.log
```

## Passwords and email

### Can I send real emails?

Yes. Put an SMTP address in `SMTP_URL` in `api/.env`, for example a mail account with an app password. Without it the API does not send anything: it prints the email in the log, because your own computer has no mail server. `api/.env.example` shows the format.

### Where do I find the reset code on my computer?

`./code.sh` prints the newest one from the API log:

```bash
./code.sh
```

Ask for the code in the app first: the API prints the email only after a forgot-password request, and only one per address per minute. A real server would email it.

## Google sign-in

### Where do I find the client ID?

In the Google Cloud console: APIs and Services, then Credentials, then your **Web** client. The ID looks like `1234-abc.apps.googleusercontent.com`. It is a public identifier, not a secret. Put it in `GOOGLE_CLIENT_IDS` in `api/.env`. Without it, "Sign in with Google" answers 503 and the email and password doors keep working.

### The Google window says the account is not allowed

While the app is in Testing, only listed accounts can sign in. Add your Google account as a **test user** on the OAuth consent screen (Audience, then Test users).

### Google sign-in fails on my emulator

Three things must be true: the emulator uses a **Google Play** system image, a Google account is signed in inside the emulator (Settings, Passwords and accounts), and that account is a test user of the consent screen.

### Must the Google email match the account email?

No. When you link Google to an account you are already signed in to, you prove both doors: the password session and the Google token. A different Google email is fine. The server recognises the person by Google's stable `sub`, never by the email alone.

## The Flutter app

### The app says it cannot reach the server

Either the API is not running, or the address is wrong. Check the API first:

```bash
curl localhost:3220/healthz
```

The Android emulator reaches your computer at `10.0.2.2`, not `localhost`; `./start.sh` already gives the app that address. On a real phone, use your computer's address on the same Wi-Fi network.

## Design choices

### Why not just add a column to `users` for the reset code?

A person can have several codes over time, and a code has its own lifetime and counters (when it expires, how many guesses are left). Its own table keeps `users` clean and lets us delete a code the moment it is used.

### Why the plain `http` package and not a bigger library?

It is enough here and easy to read. Larger apps often add a library such as `dio`, and the idea stays the same: one place in the app talks HTTP.

## Tests

### Do the tests call the real Google?

No. The signature check belongs to Google's own library; the tests check our own rules around it. The tests also run on their own database, never your real one:

```bash
cd api
createdb bip_gate_qa
DATABASE_URL=postgres://localhost/bip_gate_qa npm test
```
