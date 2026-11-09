#!/usr/bin/env bash
# THE GATE: one script that starts everything.
#   ./start.sh        PostgreSQL check -> database -> API -> Android emulator -> Flutter app (hot reload: r / R / q)
#   ./start.sh api    only the API (http://localhost:3220)
#   ./code.sh         show the newest forgot-password code (printed in the API log)
# Stop it all with ./stop.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$PWD"
RUN="$ROOT/.run"
mkdir -p "$RUN"
MODE="${1:-all}"
PORT="${PORT:-3220}"

say()  { printf '%s\n' "$*"; }
fail() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

# ── 1. The tools ─────────────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Install version 22 or newer from https://nodejs.org (or: brew install node)."
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || fail "Node.js $(node -v) is too old. This project needs version 22 or newer."
command -v npm >/dev/null 2>&1 || fail "npm is missing (it comes with Node.js)."
for tool in psql pg_isready; do
  command -v "$tool" >/dev/null 2>&1 || fail "PostgreSQL tools not found ($tool). Install PostgreSQL (brew install postgresql@16) and open a new Terminal."
done
pg_isready -q || fail "PostgreSQL is not accepting connections. Start it, then run ./start.sh again.
       Homebrew:     brew services start postgresql@16
       Postgres.app: open the app and click Start.
     (This script never resets or drops a database.)"

if [ "$MODE" = "all" ]; then
  FLUTTER="$(command -v flutter || true)"; [ -n "$FLUTTER" ] || { [ -x "$HOME/flutter/bin/flutter" ] && FLUTTER="$HOME/flutter/bin/flutter"; } || true
  [ -n "$FLUTTER" ] || fail "Flutter is not installed. See https://docs.flutter.dev/get-started/install (expected at ~/flutter/bin/flutter or on your PATH)."
  SDK=""
  for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -n "$candidate" ] && [ -x "$candidate/platform-tools/adb" ]; then SDK="$candidate"; break; fi
  done
  [ -n "$SDK" ] || fail "Android SDK not found. Install Android Studio (https://developer.android.com/studio), then create an emulator in Device Manager."
  ADB="$SDK/platform-tools/adb"
  EMULATOR="$SDK/emulator/emulator"
  [ -x "$EMULATOR" ] || fail "The Android emulator is not installed (SDK Manager > SDK Tools > Android Emulator)."
  export ANDROID_HOME="$SDK"
fi

# ── 2. Database, settings, packages ──────────────────────────────────────────────
[ -f api/.env ] || {
  cp api/.env.example api/.env
  SECRET="$(openssl rand -hex 32 2>/dev/null || node -p "require('crypto').randomBytes(32).toString('hex')")"
  awk -v s="$SECRET" '/^JWT_SECRET=/{print "JWT_SECRET=" s; next} {print}' api/.env > api/.env.tmp && mv api/.env.tmp api/.env
  chmod 600 api/.env
  say "Created api/.env with a new random JWT_SECRET."
}
if [ -z "${JWT_SECRET:-}" ]; then
  FOUND="$(grep -E '^JWT_SECRET=.{32,}' api/.env || true)"
  [ -n "$FOUND" ] || fail "api/.env has no JWT_SECRET (32+ characters). Add one:  openssl rand -hex 32"
fi

DATABASE_URL="${DATABASE_URL:-$(grep -E '^DATABASE_URL=' api/.env | head -1 | cut -d= -f2- | tr -d "\"' " || true)}"
DATABASE_URL="${DATABASE_URL:-postgres://localhost/bip_gate}"
export DATABASE_URL
DB="${DATABASE_URL##*/}"; DB="${DB%%\?*}"
[[ "$DB" =~ ^[A-Za-z0-9_]+$ ]] || fail "Cannot read a simple database name from DATABASE_URL."
ADMIN_URL="${DATABASE_URL%/*}/postgres"
EXISTS="$(psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB'" 2>/dev/null || true)"
if [ "$EXISTS" != "1" ]; then
  psql "$ADMIN_URL" -qc "CREATE DATABASE \"$DB\"" || fail "Could not create the database $DB."
  say "Created the database $DB."
else
  say "Database $DB: found."
fi

[ -d api/node_modules ] || { say "Installing the API packages (npm ci)…"; (cd api && npm ci --no-audit --no-fund >/dev/null); }

# ── 3. The API ───────────────────────────────────────────────────────────────────
HEALTH="$(curl -s --max-time 2 "http://127.0.0.1:$PORT/healthz" || true)"
if [[ "$HEALTH" == *'"app":"bip-gate"'* && "$HEALTH" == *'"version":"2.'* ]]; then
  say "API: already running on port $PORT, reusing it."
elif lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  fail "Port $PORT is already used by something that is not this version of the Gate API.
       If it is the old course launcher, stop it first. From the course folder:
         python3 LOCAL-ONLY/bip-local.py stop"
else
  say "API: starting on port $PORT…"
  set -m   # its own process group, so Ctrl+C in this window does not stop it
  (cd api && exec env PORT="$PORT" nohup node --env-file-if-exists=.env src/server.js) > "$RUN/api.log" 2>&1 &
  echo $! > "$RUN/api.pid"   # the subshell becomes node (exec), so this is node's own pid
  set +m
  for _ in $(seq 1 40); do
    HEALTH="$(curl -s --max-time 2 "http://127.0.0.1:$PORT/healthz" || true)"
    [[ "$HEALTH" == *'"ok":true'* ]] && break
    kill -0 "$(cat "$RUN/api.pid")" 2>/dev/null || { tail -n 15 "$RUN/api.log" >&2; fail "The API stopped. Log: $RUN/api.log"; }
    sleep 0.5
  done
  [[ "$HEALTH" == *'"ok":true'* ]] || { tail -n 15 "$RUN/api.log" >&2; fail "The API did not answer in time. Log: $RUN/api.log"; }
  say "API: ready at http://localhost:$PORT   (log: .run/api.log)"
fi
say "Forgot-password codes: your computer has no mail server, so the API prints the email. Read it with ./code.sh"

if [ "$MODE" = "api" ]; then
  say "Only the API was started. Stop it with ./stop.sh"
  exit 0
fi

# ── 4. The emulator ──────────────────────────────────────────────────────────────
running_emulator() { "$ADB" devices | awk '/^emulator-[0-9]+[[:space:]]+device$/ {print $1; exit}'; }
SERIAL="$(running_emulator || true)"
if [ -n "$SERIAL" ]; then
  say "Emulator: $SERIAL is already running, reusing it."
else
  AVDS="$("$EMULATOR" -list-avds 2>/dev/null | grep -v '^INFO' || true)"
  [ -n "$AVDS" ] || fail "No Android emulator exists yet. In Android Studio: Device Manager > Create Device."
  AVD_NAME="${AVD:-BIP_Gate_API_35}"
  grep -qx "$AVD_NAME" <<<"$AVDS" || AVD_NAME="$(head -n 1 <<<"$AVDS")"
  say "Emulator: starting $AVD_NAME (the first start takes a minute)…"
  set -m
  # EMULATOR_ARGS: optional extra flags, e.g. EMULATOR_ARGS="-gpu host" on a busy or slow computer.
  # shellcheck disable=SC2086
  nohup "$EMULATOR" -avd "$AVD_NAME" -no-snapshot-load -no-boot-anim -feature -Vulkan ${EMULATOR_ARGS:-} > "$RUN/emulator.log" 2>&1 &
  echo $! > "$RUN/emulator.pid"
  set +m
  : > "$RUN/emulator.started"
  for _ in $(seq 1 240); do
    SERIAL="$(running_emulator || true)"
    [ -n "$SERIAL" ] && break
    kill -0 "$(cat "$RUN/emulator.pid")" 2>/dev/null || fail "The emulator stopped. Log: $RUN/emulator.log"
    sleep 1
  done
  [ -n "$SERIAL" ] || fail "The emulator did not appear. Log: $RUN/emulator.log"
fi
for _ in $(seq 1 240); do
  [ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break
  sleep 1
done
[ "$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] || fail "Android did not finish booting."
echo "$SERIAL" > "$RUN/emulator.serial"
say "Emulator: $SERIAL is ready."

# ── 5. The Flutter app ───────────────────────────────────────────────────────────
GOOGLE_ID="${GOOGLE_CLIENT_IDS:-$(grep -E '^GOOGLE_CLIENT_IDS=' api/.env | head -1 | cut -d= -f2- || true)}"
GOOGLE_ID="$(printf '%s' "${GOOGLE_ID%%,*}" | tr -d "\"' ")"
DEFINES=(--dart-define="API_URL=http://10.0.2.2:$PORT")
if [ -n "$GOOGLE_ID" ]; then DEFINES+=(--dart-define="GOOGLE_WEB_CLIENT_ID=$GOOGLE_ID"); say "Google sign-in: on"; else say "Google sign-in: off (no GOOGLE_CLIENT_IDS in api/.env)"; fi

cd client
if [ ! -f .dart_tool/package_config.json ] || [ pubspec.yaml -nt .dart_tool/package_config.json ]; then "$FLUTTER" pub get >/dev/null; fi
say "App: building and starting (r = hot reload, R = hot restart, q = quit)…"
trap 'true' INT   # Ctrl+C reaches flutter; this script goes on to print the reminder below
set +e
# The inner shell writes its own pid, then becomes flutter (exec): flutter.pid is flutter's pid.
"$BASH" -c 'echo $$ > "$1"; shift; exec "$@"' _ "$RUN/flutter.pid" "$FLUTTER" run -d "$SERIAL" --no-enable-impeller "${DEFINES[@]}"
set -e
rm -f "$RUN/flutter.pid"
say ""
say "The API and the emulator are still running. Run ./stop.sh when you are done."
