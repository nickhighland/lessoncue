#!/usr/bin/env bash
# Remove the retired Shlink Web client from a LessonCue server.
#
# This is a one-time migration for a server that ran the pre-Link Studio
# shortener. It removes only the old management containers and the old Shlink
# Web client image. It deliberately keeps the Shlink API and PostgreSQL
# containers, because Link Shortener Companion still uses them.
#
# Run as root or with sudo:
#   sudo ./remove-shlink-web-client.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  exec sudo -- "$0" "$@"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed on this server." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running or this account cannot access it." >&2
  exit 1
fi

legacy_ids="$({
  for service in shlink-web-client shlink-web shlink-web-gate shlink-gate; do
    docker ps -aq --filter "label=com.docker.compose.service=${service}" || true
  done
  docker ps -aq --filter "ancestor=shlinkio/shlink-web-client" || true
  for name in lessoncue-shlink-gate lessoncue-shlink-web lessoncue-shlink-web-client; do
    docker ps -aq --filter "name=${name}" || true
  done
} | awk 'NF && !seen[$0]++')"

removed=0
while IFS= read -r id; do
  [ -n "$id" ] || continue
  name="$(docker inspect --format '{{.Name}}' "$id" 2>/dev/null | sed 's#^/##')"
  echo "Removing retired Shlink Web container ${name:-$id}"
  docker rm -f "$id" >/dev/null
  removed=$((removed + 1))
done <<< "$legacy_ids"

old_images="$(docker image ls --format '{{.Repository}}:{{.Tag}} {{.ID}}' 'shlinkio/shlink-web-client' 2>/dev/null | awk '!seen[$2]++' || true)"
while IFS= read -r image_line; do
  [ -n "$image_line" ] || continue
  image="${image_line##* }"
  echo "Removing retired Shlink Web image ${image_line% *}"
  docker image rm "$image" >/dev/null || {
    echo "Could not remove ${image_line% *}; another container still references it." >&2
    exit 1
  }
done <<< "$old_images"

if [ "$removed" -eq 0 ] && [ -z "$old_images" ]; then
  echo "No retired Shlink Web client containers or images were found."
else
  echo "Retired Shlink Web client removed. Shlink API and PostgreSQL were left running."
fi

remaining="$(docker ps -a --filter "ancestor=shlinkio/shlink-web-client" -q 2>/dev/null || true)"
if [ -n "$remaining" ]; then
  echo "A retired Shlink Web container is still present: ${remaining}" >&2
  exit 1
fi
