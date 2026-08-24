#!/usr/bin/env bash
# Install the optional URL shortener alongside LessonCue.
#
#   scripts/shortener-install.sh go.example.org
#
# Generates the credentials, starts the stack, and prints what to do next.
# Safe to run again: existing secrets and data are left exactly as they are, so
# this repairs a half-finished install rather than starting over.
set -euo pipefail

cd "$(dirname "$0")/.."

SHORT_DOMAIN="${1:-${SHORT_DOMAIN:-}}"
if [ -z "$SHORT_DOMAIN" ]; then
  cat >&2 <<'USAGE'
Give the short domain this installation will use.

  scripts/shortener-install.sh go.example.org

It is the domain short links are minted on, bare and without a scheme. The
management console defaults to short.<that domain>, and can be changed later in
LessonCue under Settings → Integrations · URL shortener.
USAGE
  exit 64
fi

case "$SHORT_DOMAIN" in
  *://*|*/*) echo "Give the domain on its own, without a scheme or a path." >&2; exit 64 ;;
  *.*) ;;
  *) echo "That does not look like a public domain name." >&2; exit 64 ;;
esac

DATA_DIR="${SHORTENER_DATA_DIR:-./shortener-data}"
DB_PASSWORD_FILE="${SHORTENER_DB_PASSWORD_FILE:-${DATA_DIR}/db-password}"
INTEGRATION_KEY_FILE="${SHORTENER_INTEGRATION_KEY_FILE:-${DATA_DIR}/integration-key}"

mkdir -p "$DATA_DIR" "${DATA_DIR}/postgres"
chmod 700 "$DATA_DIR"

# Generated once and kept. Regenerating the database password on a second run
# would lock the shortener out of its own data.
new_secret() { LC_ALL=C tr -dc 'a-f0-9' </dev/urandom | head -c 64; }

for file in "$DB_PASSWORD_FILE" "$INTEGRATION_KEY_FILE"; do
  if [ -s "$file" ]; then
    echo "Keeping the existing secret in ${file}"
  else
    new_secret > "$file"
    chmod 600 "$file"
    echo "Generated ${file}"
  fi
done

echo
echo "Starting the shortener for ${SHORT_DOMAIN}"
SHORT_DOMAIN="$SHORT_DOMAIN" \
SHORTENER_DB_PASSWORD_FILE="$DB_PASSWORD_FILE" \
SHORTENER_INTEGRATION_KEY_FILE="$INTEGRATION_KEY_FILE" \
  docker compose --profile shortener up -d

SHORTENER_HTTP_PORT="${SHORTENER_HTTP_PORT:-8081}"
SHORTENER_UI_PORT="${SHORTENER_UI_PORT:-8082}"

echo
echo "Waiting for it to come up"
for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:${SHORTENER_HTTP_PORT}/rest/v3/health" >/dev/null 2>&1; then
    echo "The shortener is answering."
    break
  fi
  sleep 3
done

cat <<NEXT

Next, and none of it can be done from here:

1. Add two routes to the Cloudflare Tunnel already serving LessonCue.
   Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames.

     ${SHORT_DOMAIN}  ->  http://localhost:${SHORTENER_HTTP_PORT}
     short.${SHORT_DOMAIN}  ->  http://localhost:${SHORTENER_UI_PORT}

   Leave every existing entry alone. Do not add a Redirect Rule for
   ${SHORT_DOMAIN}: a rule on the whole hostname would also swallow the short
   links and the game codes underneath it.

2. In LessonCue, open Settings → Integrations · URL shortener. Enter
   ${SHORT_DOMAIN} and where the shortener is reachable, then use
   Issue API keys and Repair reserved codes.

3. Press Test configuration. It checks the short domain, the management
   address, and a game code separately.

LessonCue's integration key is in ${INTEGRATION_KEY_FILE}. The shortener was
started with it, so LessonCue can provision its reserved codes with a
credential of its own rather than a person's.
NEXT
