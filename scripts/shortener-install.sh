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
# Where the bare short domain should send people. Shlink reads this at start-up,
# so it belongs here rather than only in LessonCue's settings.
SHORT_DOMAIN_ROOT_REDIRECT="${2:-${SHORT_DOMAIN_ROOT_REDIRECT:-}}"
if [ -z "$SHORT_DOMAIN" ]; then
  cat >&2 <<'USAGE'
Give the short domain this installation will use.

  scripts/shortener-install.sh go.example.org [https://www.example.org]

The first argument is the domain short links are minted on, bare and without a
scheme. The second is optional: where someone visiting the bare domain should
be sent -- your main website, usually. Both can be changed later in LessonCue
under Settings → Integrations · URL shortener.
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

# The integration key has to be readable by both sides: the shortener is
# started with it, and LessonCue authenticates with it. LessonCue's data
# directory is mounted into its container, so the shared copy lives there.
LESSONCUE_DATA_PATH="${LESSONCUE_DATA_PATH:-./lessoncue-data}"
SHARED_KEY_DIR="${LESSONCUE_DATA_PATH}/config/shortener"
INTEGRATION_KEY_FILE="${SHORTENER_INTEGRATION_KEY_FILE:-${SHARED_KEY_DIR}/integration-key}"

mkdir -p "$DATA_DIR" "${DATA_DIR}/postgres" "$SHARED_KEY_DIR"
chmod 700 "$DATA_DIR" "$SHARED_KEY_DIR"

# Generated once and kept. Regenerating the database password on a second run
# would lock the shortener out of its own data.
# A finite source: an endless `tr` feeding `head` takes SIGPIPE, and pipefail
# turns that into a failure that would abort the install on its first secret.
new_secret() { od -An -tx1 -N32 /dev/urandom | tr -d ' \n'; }

for file in "$DB_PASSWORD_FILE" "$INTEGRATION_KEY_FILE"; do
  if [ -s "$file" ]; then
    echo "Keeping the existing secret in ${file}"
  else
    new_secret > "$file"
    chmod 600 "$file"
    echo "Generated ${file}"
  fi
done

# Exported rather than set per-command: the compose file requires them, and
# reading the resolved configuration back needs them just as much as `up` does.
export SHORT_DOMAIN
export SHORTENER_DB_PASSWORD_FILE="$DB_PASSWORD_FILE"
export SHORTENER_INTEGRATION_KEY_FILE="$INTEGRATION_KEY_FILE"
# Handed to the console so it arrives already connected. This is why the console
# is not routed publicly by default: the value ends up in a page a browser
# reads, and only the local network should be able to read it.
export SHORT_DOMAIN_ROOT_REDIRECT

echo
echo "Starting the shortener for ${SHORT_DOMAIN}"
docker compose --profile shortener up -d

# Read back from compose rather than assumed, so the printed routes match the
# ports actually bound -- including any set in .env, which this shell never saw.
resolved_port() {
  docker compose --profile shortener config --format json 2>/dev/null \
    | python3 -c "import json,sys; s=json.load(sys.stdin)['services'].get('$1',{}); print((s.get('ports') or [{}])[0].get('published',''))" 2>/dev/null
}
SHORTENER_HTTP_PORT="$(resolved_port shlink)"
SHORTENER_UI_PORT="$(resolved_port shlink-web-client)"
: "${SHORTENER_HTTP_PORT:=8081}"
: "${SHORTENER_UI_PORT:=8082}"

echo
echo "Waiting for it to come up"
healthy=0
for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:${SHORTENER_HTTP_PORT}/rest/health" >/dev/null 2>&1; then
    echo "The shortener is answering."
    healthy=1
    break
  fi
  sleep 3
done

if [ "$healthy" -ne 1 ]; then
  cat >&2 <<'FAILED'

The shortener never answered. Nothing has been configured, and printing
tunnel routes for a service that is not running would only waste your time.

Look at what it said:

  docker compose --profile shortener logs shlink
  docker compose --profile shortener logs shlink-db
FAILED
  exit 1
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$SERVER_IP" ] && SERVER_IP="this server"

cat <<NEXT

Done. The shortener is running and LessonCue will pick it up on its own --
it reads the same key the shortener was started with, and provisions the
hundred reserved game codes within a few minutes.

One thing left, and it is the only part that cannot be done from here:

    Add TWO routes to the Cloudflare Tunnel already serving LessonCue.
    Zero Trust -> Networks -> Tunnels -> your tunnel -> Public Hostnames.

        ${SHORT_DOMAIN}        ->  http://localhost:${SHORTENER_HTTP_PORT}
        short.${SHORT_DOMAIN}  ->  http://localhost:${SHORTENER_UI_PORT}

    Leave every existing entry alone. Do not add a Redirect Rule for
    ${SHORT_DOMAIN}: a rule on the whole hostname would also swallow the short
    links and the game codes underneath it.

Then in LessonCue, Settings -> Integrations - URL shortener:

  * Press Test configuration to check both hostnames.
  * Press Show API key, and paste it into the console the first time you open
    short.${SHORT_DOMAIN}. The console is a page in your browser, so a key
    built into it would be handed to anyone who opened that address.

Worth doing: put Cloudflare Access in front of short.${SHORT_DOMAIN}. It
manages every short link on the domain and an API key is all that guards it.
NEXT
