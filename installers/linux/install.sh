#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root: sudo ./install.sh"
  exit 1
fi

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAYLOAD_DIR="${SOURCE_DIR}/payload"
if [[ ! -x "${PAYLOAD_DIR}/LessonCue.Server" ]]; then
  echo "Missing payload/LessonCue.Server. Use a packaged release archive."
  exit 1
fi

id lessoncue >/dev/null 2>&1 || useradd --system --home /var/lib/lessoncue --shell /usr/sbin/nologin lessoncue
install -d -o lessoncue -g lessoncue /var/lib/lessoncue/{database,media/originals,media/processed,media/thumbnails,media/temporary,branding,backups,logs,config}
install -d /opt/lessoncue
cp -a "${PAYLOAD_DIR}/." /opt/lessoncue/
chown -R root:root /opt/lessoncue
install -m 0644 "${SOURCE_DIR}/lessoncue.service" /etc/systemd/system/lessoncue.service

if command -v avahi-daemon >/dev/null 2>&1; then
  AVAHI_SOURCE="${SOURCE_DIR}/docker/avahi-service.xml"
  [[ -f "${AVAHI_SOURCE}" ]] || AVAHI_SOURCE="${SOURCE_DIR}/../../docker/avahi-service.xml"
  install -m 0644 "${AVAHI_SOURCE}" /etc/avahi/services/lessoncue.service
  systemctl reload avahi-daemon || true
fi

if command -v ufw >/dev/null 2>&1; then ufw allow 8080/tcp >/dev/null || true; fi
systemctl daemon-reload
systemctl enable --now lessoncue
echo "LessonCue is installed. Open http://$(hostname -I | awk '{print $1}'):8080"
