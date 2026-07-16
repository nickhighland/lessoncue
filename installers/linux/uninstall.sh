#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this uninstaller as root: sudo ./uninstall.sh"
  exit 1
fi

systemctl disable --now lessoncue 2>/dev/null || true
systemctl disable --now lessoncue-update.path 2>/dev/null || true
systemctl stop lessoncue-update 2>/dev/null || true
rm -f /etc/systemd/system/lessoncue.service /etc/systemd/system/lessoncue-update.service /etc/systemd/system/lessoncue-update.path /etc/avahi/services/lessoncue.service
rm -f /usr/local/sbin/lessoncue-update
systemctl daemon-reload
rm -rf /opt/lessoncue
echo "LessonCue was removed. Media and configuration remain in /var/lib/lessoncue."
