#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this uninstaller as root: sudo ./uninstall.sh"
  exit 1
fi

systemctl disable --now lessoncue 2>/dev/null || true
rm -f /etc/systemd/system/lessoncue.service /etc/avahi/services/lessoncue.service
systemctl daemon-reload
rm -rf /opt/lessoncue
echo "LessonCue was removed. Media and configuration remain in /var/lib/lessoncue."
