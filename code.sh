#!/usr/bin/env bash
# Shows the newest "Forgot password" code. Your computer has no mail server, so the API prints the email in its log.
cd "$(dirname "${BASH_SOURCE[0]}")"
[ -f .run/api.log ] || { echo "The API has not been started yet. Run ./start.sh first."; exit 1; }
LINE="$(grep -E 'Your Gate reset code is [0-9]{6}' .run/api.log | tail -n 1 || true)"
[ -n "$LINE" ] || { echo "No reset code yet. Tap \"Forgot password?\" in the app, enter an email, then run this again."; exit 0; }
TO="$(grep -E '^To: ' .run/api.log | tail -n 1)"
echo "$TO"
echo "$LINE"
