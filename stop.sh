#!/usr/bin/env bash
# Stops what ./start.sh started: the Flutter app, the API and (if start.sh opened it) the emulator.
#   ./stop.sh        flutter app + API + the emulator start.sh opened
#   ./stop.sh all    also closes any other running emulator
# PostgreSQL is never touched.
cd "$(dirname "${BASH_SOURCE[0]}")"
ROOT="$PWD"
RUN="$ROOT/.run"
WHAT="${1:-}"

say() { printf '%s\n' "$*"; }
alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
descendants() { local p; for p in $(pgrep -P "$1" 2>/dev/null); do echo "$p"; descendants "$p"; done; }
command_of() { ps -p "$1" -o command= 2>/dev/null || true; }

# Stop a process (and its children) only when its command line matches what we started.
stop_pid() {   # name pidfile pattern signal
  local name="$1" file="$2" pattern="$3" sig="${4:-TERM}" pid kids
  pid="$(cat "$file" 2>/dev/null || true)"
  if ! alive "$pid"; then say "$name: was not running."; rm -f "$file"; return; fi
  if ! [[ "$(command_of "$pid")" =~ $pattern ]]; then
    say "$name: pid $pid is not ours any more; left alone."; rm -f "$file"; return
  fi
  kids="$(descendants "$pid")"
  kill -"$sig" "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do alive "$pid" || break; sleep 0.25; done
  alive "$pid" && kill -KILL "$pid" 2>/dev/null || true
  # shellcheck disable=SC2086
  for k in $kids; do kill -TERM "$k" 2>/dev/null || true; done
  rm -f "$file"
  say "$name: stopped."
}

stop_pid "Flutter app" "$RUN/flutter.pid" 'flutter|dart' INT
stop_pid "API        " "$RUN/api.pid" 'node.*src/server\.js'

# ── the emulator ──
SDK=""
for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
  if [ -n "$candidate" ] && [ -x "$candidate/platform-tools/adb" ]; then SDK="$candidate"; break; fi
done
close_emulator() {   # serial
  "$SDK/platform-tools/adb" -s "$1" emu kill >/dev/null 2>&1 || true
  for _ in $(seq 1 30); do
    "$SDK/platform-tools/adb" devices 2>/dev/null | grep -q "^$1" || return 0
    sleep 1
  done
}
if [ -z "$SDK" ]; then
  say "Emulator   : Android SDK not found; nothing to do."
elif [ "$WHAT" = "all" ]; then
  SERIALS="$("$SDK/platform-tools/adb" devices 2>/dev/null | awk '/^emulator-[0-9]+/ {print $1}')"
  if [ -z "$SERIALS" ]; then say "Emulator   : was not running."; fi
  for s in $SERIALS; do close_emulator "$s"; say "Emulator   : $s closed."; done
  rm -f "$RUN/emulator.started" "$RUN/emulator.pid" "$RUN/emulator.serial"
elif [ -f "$RUN/emulator.started" ]; then
  SERIAL="$(cat "$RUN/emulator.serial" 2>/dev/null || true)"
  if [ -n "$SERIAL" ] && "$SDK/platform-tools/adb" devices 2>/dev/null | grep -q "^$SERIAL"; then
    close_emulator "$SERIAL"; say "Emulator   : $SERIAL closed."
  else
    say "Emulator   : was not running."
  fi
  rm -f "$RUN/emulator.started" "$RUN/emulator.pid" "$RUN/emulator.serial"
else
  say "Emulator   : left running (start.sh did not open it). Use ./stop.sh all to close it too."
fi
say "PostgreSQL : untouched."
