#!/usr/bin/env bash
# Update the optional URL shortener, with a way back if the migration fails.
#
# Deliberately a script rather than a button: this stops a service the
# organization's short links depend on, and the operator should see each step.
#
#   scripts/shortener-update.sh [new-image-tag]
#
# With no tag it checks health and reports the running version without changing
# anything.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose --profile shortener)
BACKUP_DIR="${SHORTENER_BACKUP_DIR:-./shortener-data/backups}"
NEW_TAG="${1:-}"

running_version() {
  "${COMPOSE[@]}" exec -T shlink sh -c 'shlink --version 2>/dev/null || true' | head -1
}

health() {
  "${COMPOSE[@]}" exec -T shlink curl --fail --silent http://localhost:8080/rest/health >/dev/null 2>&1
}

echo "Running version: $(running_version)"
if ! health; then
  echo "The shortener is not healthy right now. Fix that before updating." >&2
  exit 1
fi

reserved_present() {
  # A tagged count is the quickest proof the hundred survived the migration.
  "${COMPOSE[@]}" exec -T shlink-db psql -U shlink -d shlink -tAc \
    "select count(*) from short_urls u
       join short_urls_in_tags t on t.short_url_id = u.id
       join tags g on g.id = t.tag_id
      where g.name = 'lessoncue-reserved'" 2>/dev/null | tr -d '[:space:]'
}

BEFORE_CODES="$(reserved_present || echo unknown)"
echo "Reserved codes before: ${BEFORE_CODES}"

if [ -z "$NEW_TAG" ]; then
  echo "No tag given, so nothing was changed."
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="${BACKUP_DIR}/shlink-${STAMP}.sql"
echo "Backing up to ${DUMP}"
"${COMPOSE[@]}" exec -T shlink-db pg_dump -U shlink shlink > "$DUMP"
echo "Backed up $(wc -c < "$DUMP") bytes"

echo "Updating to ${NEW_TAG}"
SHORTENER_IMAGE="ghcr.io/shlinkio/shlink:${NEW_TAG}" "${COMPOSE[@]}" up -d shlink

echo "Waiting for migrations and health"
for _ in $(seq 1 30); do
  if health; then
    AFTER_CODES="$(reserved_present || echo unknown)"
    echo "Running version: $(running_version)"
    echo "Reserved codes after: ${AFTER_CODES}"
    if [ "$BEFORE_CODES" != "unknown" ] && [ "$AFTER_CODES" != "$BEFORE_CODES" ]; then
      echo "The reserved code count changed. Use Repair reserved codes in LessonCue." >&2
      exit 2
    fi
    echo "Update finished. Check an ordinary short link and the management console."
    exit 0
  fi
  sleep 5
done

echo "The shortener did not come back healthy." >&2
echo "Its database is unchanged on disk, and ${DUMP} is a dump from before the update." >&2
echo "Roll back by putting the previous tag in compose.yaml and bringing it up again." >&2
exit 1
