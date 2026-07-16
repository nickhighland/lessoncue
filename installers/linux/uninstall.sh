#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this uninstaller as root: sudo ./uninstall.sh"
  exit 1
fi

systemctl disable --now lessoncue 2>/dev/null || true
systemctl disable --now lessoncue-update.path 2>/dev/null || true
systemctl stop lessoncue-update 2>/dev/null || true
systemctl disable --now lessoncue-cloudflared.service 2>/dev/null || true
if [[ -f /etc/avahi/avahi-daemon.conf && -f /var/lib/lessoncue/config/local-hostname ]]; then
  LOCAL_HOSTNAME="$(tr -d '[:space:]' < /var/lib/lessoncue/config/local-hostname)"
  if [[ "${LOCAL_HOSTNAME}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    sed -i -E "s/^[[:space:]]*host-name[[:space:]]*=[[:space:]]*${LOCAL_HOSTNAME}[[:space:]]*$/#host-name=/" /etc/avahi/avahi-daemon.conf
  fi
fi
rm -f /etc/systemd/system/lessoncue.service /etc/systemd/system/lessoncue-cloudflared.service /etc/systemd/system/lessoncue-update.service /etc/systemd/system/lessoncue-update.path /etc/avahi/services/lessoncue.service
rm -f /usr/local/sbin/lessoncue-update
rm -f /etc/lessoncue/cloudflare-token
rm -rf /var/cache/lessoncue
rmdir /etc/lessoncue 2>/dev/null || true
userdel lessoncue-tunnel 2>/dev/null || true
systemctl daemon-reload
systemctl restart avahi-daemon 2>/dev/null || true
rm -rf /opt/lessoncue
echo "LessonCue was removed. Media and configuration remain in /var/lib/lessoncue."
