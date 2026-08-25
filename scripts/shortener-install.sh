#!/usr/bin/env bash
# Install the optional URL shortener alongside LessonCue.
#
#   scripts/shortener-install.sh go.example.org
#
# Generates the credentials, starts the stack, and prints what to do next.
# Safe to run again: existing secrets and data are left exactly as they are, so
# this repairs a half-finished install rather than starting over.
set -euo pipefail

# This script ships two ways: in the repository it sits in scripts/ with the
# compose file a level up, and in the release bundle it sits directly beside
# it. Find the compose file rather than assume which copy this is. Assuming
# sent an administrator's install to /opt, where there is no compose file, and
# reported nothing beyond "the shortener did not start".
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ -f "${HERE}/compose.yaml" ]; then
  cd "$HERE"
elif [ -f "${HERE}/../compose.yaml" ]; then
  cd "${HERE}/.."
else
  echo "Cannot find compose.yaml beside $0 or in its parent directory." >&2
  exit 1
fi

SHORT_DOMAIN="${1:-${SHORT_DOMAIN:-}}"
# Where the bare short domain should send people. Shlink reads this at start-up,
# so it belongs here rather than only in LessonCue's settings.
ROOT_REDIRECT_OVERRIDE=0
if [ "$#" -ge 2 ]; then
  SHORT_DOMAIN_ROOT_REDIRECT="$2"
  ROOT_REDIRECT_OVERRIDE=1
elif [ "${SHORT_DOMAIN_ROOT_REDIRECT+x}" = x ]; then
  ROOT_REDIRECT_OVERRIDE=1
else
  SHORT_DOMAIN_ROOT_REDIRECT=""
fi
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

# The protected Linux updater runs with ProtectHome enabled, so Docker cannot
# create its default /root/.docker directory there. Keep Compose's transient
# client state beside the shortener data instead; this directory contains no
# LessonCue or registry secret and is safe to recreate if necessary.
if [ -z "${DOCKER_CONFIG:-}" ]; then
  DOCKER_CONFIG="${SHORTENER_DOCKER_CONFIG_DIR:-${DATA_DIR}/docker-config}"
  mkdir -p "$DOCKER_CONFIG"
  chmod 700 "$DOCKER_CONFIG"
  export DOCKER_CONFIG
fi

# The integration key has to be readable by both sides: the shortener is
# started with it, and LessonCue authenticates with it. LessonCue's data
# directory is mounted into its container, so the shared copy lives there.
LESSONCUE_DATA_PATH="${LESSONCUE_DATA_PATH:-./lessoncue-data}"
# The LessonCue server writes this handoff before asking its protected updater
# to install the shortener. Use it as a final fallback as well, so a direct
# reinstall cannot silently replace a configured bare-domain destination with
# an empty Shlink redirect. An explicit argument or environment value still
# wins, including an intentional empty value for the not-found mode.
if [ "$ROOT_REDIRECT_OVERRIDE" -eq 0 ] && [ -r "${LESSONCUE_DATA_PATH}/config/shortener-root-redirect" ]; then
  SHORT_DOMAIN_ROOT_REDIRECT="$(cat "${LESSONCUE_DATA_PATH}/config/shortener-root-redirect")"
fi
SHARED_KEY_DIR="${LESSONCUE_DATA_PATH}/config/shortener"
INTEGRATION_KEY_FILE="${SHORTENER_INTEGRATION_KEY_FILE:-${SHARED_KEY_DIR}/integration-key}"
CONSOLE_KEY_FILE="${SHARED_KEY_DIR}/console-key"
COMPANION_DATA_DIR="${SHARED_KEY_DIR}/companion-data"
COMPANION_CONTROL_DIR="${SHARED_KEY_DIR}/companion-control"
PASSWORD_RESET_FILE="${COMPANION_CONTROL_DIR}/password-reset"

mkdir -p "$DATA_DIR" "${DATA_DIR}/postgres" "$SHARED_KEY_DIR" "$COMPANION_DATA_DIR" "$COMPANION_CONTROL_DIR"
chmod 700 "$DATA_DIR" "$SHARED_KEY_DIR" "$COMPANION_DATA_DIR" "$COMPANION_CONTROL_DIR"

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

# The shortener container runs as an unprivileged user and reads these through
# a bind mount, where the file's own mode is all that applies. Root-only secrets
# are why a perfectly healthy database sat beside a Shlink that restarted for
# ever, complaining it could not open its own password. The directories above
# stay restrictive; these two files are the part a container has to read.
chmod 644 "$DB_PASSWORD_FILE" "$INTEGRATION_KEY_FILE"

# LessonCue authenticates to the shortener with the integration key, and does
# not run as root either. Hand its directory to whoever owns LessonCue's data
# rather than assuming an account name.
owner_of() {
  stat -c '%u:%g' "$1" 2>/dev/null || stat -f '%u:%g' "$1" 2>/dev/null || true
}
OWNER="$(owner_of "$(dirname "$SHARED_KEY_DIR")")"
case "$OWNER" in
  *:*) ;;
  *) OWNER="10001:10001" ;;
esac
UI_UID="${OWNER%%:*}"
UI_GID="${OWNER##*:}"
if [ "$(id -u)" = "0" ]; then
  # The config directory, not the data root: LessonCue's data directory belongs
  # to root, and taking the owner from there quietly chowned this to root:root
  # and left LessonCue unable to read the key it authenticates with.
  chown -R "$OWNER" "$SHARED_KEY_DIR" 2>/dev/null || true
fi

# Seed the companion with a password nobody knows until LessonCue sets one.
# Without this, a fresh deployment would expose the companion's first-visit
# setup screen on its management hostname. The companion consumes this one-shot
# request into password hashes on its first request; it is not an environment
# override, so its own password settings remain usable afterwards.
if [ ! -s "$COMPANION_DATA_DIR/ui-config.json" ] || \
   ! grep -Eq '"adminPasswordHash"[[:space:]]*:[[:space:]]*"[^"]+"' "$COMPANION_DATA_DIR/ui-config.json" || \
   ! grep -Eq '"userPasswordHash"[[:space:]]*:[[:space:]]*"[^"]+"' "$COMPANION_DATA_DIR/ui-config.json"; then
  if [ ! -s "$PASSWORD_RESET_FILE" ]; then
    seed_password="$(new_secret)"
    printf '{"adminPassword":"%s","userPassword":"%s"}\n' "$seed_password" "$seed_password" > "$PASSWORD_RESET_FILE"
    unset seed_password
    chmod 600 "$PASSWORD_RESET_FILE"
    echo "Locked the companion until a password is set in LessonCue"
  fi
fi

# Compose needs the secret source file to exist even for the first `config` or
# `up`. A placeholder is used only until Shlink can mint the scoped console
# key; it is never used to start the companion.
CONSOLE_KEY_NEEDS_MINT=0
if [ ! -s "$CONSOLE_KEY_FILE" ]; then
  new_secret > "$CONSOLE_KEY_FILE"
  CONSOLE_KEY_NEEDS_MINT=1
fi
chmod 644 "$CONSOLE_KEY_FILE"
if [ "$(id -u)" = "0" ]; then
  chown "$OWNER" "$CONSOLE_KEY_FILE" 2>/dev/null || true
fi

# Exported rather than set per-command: the compose file requires them, and
# reading the resolved configuration back needs them just as much as `up` does.
export SHORT_DOMAIN
export SHORTENER_DB_PASSWORD_FILE="$DB_PASSWORD_FILE"
export SHORTENER_INTEGRATION_KEY_FILE="$INTEGRATION_KEY_FILE"
export SHORTENER_UI_UID="$UI_UID"
export SHORTENER_UI_GID="$UI_GID"
export LESSONCUE_UID="$UI_UID"
export LESSONCUE_GID="$UI_GID"
export SHORT_DOMAIN_ROOT_REDIRECT

# Written down, not only exported. Every later compose command -- an update, a
# restart, an operator reading logs -- runs without this shell, and a variable
# that lived only here made all of them fail on a missing SHORT_DOMAIN.
# Anything the operator set themselves (ports, bind addresses) is kept.
OWNED='^(SHORT_DOMAIN|SHORT_DOMAIN_ROOT_REDIRECT|LESSONCUE_DATA_PATH|LESSONCUE_UID|LESSONCUE_GID|SHORTENER_DB_PASSWORD_FILE|SHORTENER_INTEGRATION_KEY_FILE|SHORTENER_CONSOLE_KEY_FILE|SHORTENER_COMPANION_DATA_PATH|SHORTENER_COMPANION_CONTROL_PATH|SHORTENER_UI_IMAGE|SHORTENER_UI_UID|SHORTENER_UI_GID)='
KEPT=""
if [ -f .env ]; then
  KEPT="$(grep -v -E "$OWNED" .env || true)"
fi
{
  [ -n "$KEPT" ] && printf '%s\n' "$KEPT"
  printf 'SHORT_DOMAIN=%s\n' "$SHORT_DOMAIN"
  printf 'SHORT_DOMAIN_ROOT_REDIRECT="%s"\n' "$SHORT_DOMAIN_ROOT_REDIRECT"
  printf 'LESSONCUE_DATA_PATH=%s\n' "$LESSONCUE_DATA_PATH"
  printf 'LESSONCUE_UID=%s\n' "$UI_UID"
  printf 'LESSONCUE_GID=%s\n' "$UI_GID"
  printf 'SHORTENER_DB_PASSWORD_FILE=%s\n' "$DB_PASSWORD_FILE"
  printf 'SHORTENER_INTEGRATION_KEY_FILE=%s\n' "$INTEGRATION_KEY_FILE"
  printf 'SHORTENER_UI_UID=%s\n' "$UI_UID"
  printf 'SHORTENER_UI_GID=%s\n' "$UI_GID"
} > .env.tmp
mv .env.tmp .env
chmod 600 .env

# Always use the release bundle's compose file. A stale COMPOSE_FILE from an
# older manual install must not silently send this migration back to Shlink
# Web, and the explicit file makes repository and release layouts identical.
COMPOSE=(docker compose --file "$PWD/compose.yaml" --profile shortener)

echo
echo "Starting the shortener for ${SHORT_DOMAIN}"
# Named explicitly, never a bare `up`. This compose file also describes
# LessonCue itself, which has no build context in the shipped bundle and, on a
# native install, is already serving on port 80 -- starting it here would fail
# to build and then fight the real server for its port. Start Shlink first so
# its CLI can mint the companion's scoped key before the UI container starts.
"${COMPOSE[@]}" up -d shlink-db shlink

# Read back from compose rather than assumed, so the printed routes match the
# ports actually bound -- including any set in .env, which this shell never saw.
resolved_port() {
  "${COMPOSE[@]}" config --format json 2>/dev/null \
    | python3 -c "import json,sys; s=json.load(sys.stdin)['services'].get('$1',{}); print((s.get('ports') or [{}])[0].get('published',''))" 2>/dev/null
}
SHORTENER_HTTP_PORT="$(resolved_port shlink)"
SHORTENER_UI_PORT="$(resolved_port link-shortener-companion)"
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

# The companion gets its own key, scoped to what it creates itself. Shlink's
# AUTHORED_SHORT_URLS role means a key only sees short URLs it made, so the
# hundred reserved game codes -- authored by LessonCue's key -- are invisible
# through the web interface and cannot be edited or deleted there. The operator
# still manages every link they make themselves.
#
# Generated through the CLI, which can mint keys even though the REST API
# cannot. Once only: a second run keeps the key the companion is already using.
if [ "$CONSOLE_KEY_NEEDS_MINT" -eq 0 ]; then
  echo "Keeping the existing console key in ${CONSOLE_KEY_FILE}"
else
  MINTED="$("${COMPOSE[@]}" exec -T shlink \
    shlink api-key:generate --name=lessoncue-console --author-only 2>/dev/null \
    | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"
  if [ -n "$MINTED" ]; then
    printf '%s' "$MINTED" > "$CONSOLE_KEY_FILE"
    echo "Generated a console key that cannot see the reserved game codes"
  else
    rm -f "$CONSOLE_KEY_FILE"
    echo "Could not generate the companion's scoped console key; Link Studio was not started." >&2
    exit 1
  fi
  unset MINTED
fi
# Same reasoning as the other secrets: LessonCue reads this to show it to a
# signed-in administrator, and it does not run as root.
[ -f "$CONSOLE_KEY_FILE" ] && chmod 644 "$CONSOLE_KEY_FILE"
if [ "$(id -u)" = "0" ] && [ -n "${OWNER:-}" ]; then
  chown "$OWNER" "$CONSOLE_KEY_FILE" 2>/dev/null || true
fi

echo "Starting the Link Shortener Companion"
"${COMPOSE[@]}" up -d --build link-shortener-companion

ui_healthy=0
for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:${SHORTENER_UI_PORT}/" >/dev/null 2>&1; then
    echo "The companion is answering."
    ui_healthy=1
    break
  fi
  sleep 3
done

if [ "$ui_healthy" -ne 1 ]; then
  cat >&2 <<'FAILED_UI'

The Link Shortener Companion never answered.

Look at what it said:

  "${COMPOSE[@]}" logs link-shortener-companion
FAILED_UI
  exit 1
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$SERVER_IP" ] && SERVER_IP="this server"

cat <<NEXT

Done. The shortener and Link Shortener Companion are running and LessonCue will pick them up on its own --
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
  * Set the Companion password there. LessonCue sets both the Administrator and
    Link Studio passwords without exposing the Shlink API key to the browser.
  * After signing in, either password can be changed separately under the
    Companion's Access & brand page.

Worth doing: put Cloudflare Access in front of short.${SHORT_DOMAIN}. The
Companion has its own login, and Access adds another layer for the management
hostname.
NEXT
