#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "LessonCue updater repair must run as root."
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="${1:-unknown}"

for required in \
  lessoncue-update \
  lessoncue-update.service \
  lessoncue-update.path \
  lessoncue-update-recovery.service \
  release-signing-public.pem; do
  if [[ ! -f "${SOURCE_DIR}/${required}" ]]; then
    echo "The signed LessonCue release is missing ${required}."
    exit 1
  fi
done
if [[ ! -x "${SOURCE_DIR}/lessoncue-update" ]]; then
  echo "The signed LessonCue updater is not executable."
  exit 1
fi
if ! id lessoncue >/dev/null 2>&1; then
  echo "The LessonCue service account is missing. Run the full installer instead of updater-only repair."
  exit 1
fi

# Serialize updater repair with updates, rollbacks, and boot-time recovery.
# Replacing the updater while any of those operations is active could make its
# rollback snapshot inconsistent.
exec 9>/run/lessoncue-update.lock
if ! flock -n 9; then
  echo "Another protected LessonCue operation is active. Wait for it to finish before repairing the updater."
  exit 1
fi

install -d -o root -g root -m 0755 /usr/local/sbin /etc/lessoncue
install -o root -g root -m 0755 "${SOURCE_DIR}/lessoncue-update" /usr/local/sbin/lessoncue-update
install -o root -g root -m 0644 "${SOURCE_DIR}/lessoncue-update.service" /etc/systemd/system/lessoncue-update.service
install -o root -g root -m 0644 "${SOURCE_DIR}/lessoncue-update.path" /etc/systemd/system/lessoncue-update.path
install -o root -g root -m 0644 "${SOURCE_DIR}/lessoncue-update-recovery.service" /etc/systemd/system/lessoncue-update-recovery.service
install -o root -g root -m 0644 "${SOURCE_DIR}/release-signing-public.pem" /etc/lessoncue/release-signing-public.pem
install -d -o lessoncue -g lessoncue -m 0750 /var/lib/lessoncue
install -d -o lessoncue -g lessoncue -m 0700 /var/lib/lessoncue/config
systemctl daemon-reload
systemctl enable lessoncue-update.path lessoncue-update-recovery.service

# Release the operation lock before starting the path watcher. If an existing
# request is pending, the repaired updater can then consume it normally.
flock -u 9
exec 9>&-
systemctl start lessoncue-update.path

echo "LessonCue ${VERSION} protected updater repaired. The application, database, and media were not replaced."
