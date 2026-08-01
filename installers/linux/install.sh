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
if [[ ! -f "${SOURCE_DIR}/release-signing-public.pem" ]]; then
  echo "Missing release-signing-public.pem. Use a complete signed release archive."
  exit 1
fi
if [[ ! -x "${SOURCE_DIR}/lessoncue-media-worker" ]]; then
  echo "Missing lessoncue-media-worker. Use a complete signed release archive."
  exit 1
fi
if ! command -v bwrap >/dev/null 2>&1; then
  echo "Missing bubblewrap. Install the bubblewrap package before installing LessonCue."
  exit 1
fi

id lessoncue >/dev/null 2>&1 || useradd --system --home /var/lib/lessoncue --shell /usr/sbin/nologin lessoncue
for device_group in render video; do
  if getent group "${device_group}" >/dev/null 2>&1; then usermod -a -G "${device_group}" lessoncue; fi
done
install -d -o lessoncue -g lessoncue /var/lib/lessoncue/{database,media,media/originals,media/versions,media/processed,media/thumbnails,media/temporary,media/live-streams,branding,backups,logs,config,.cache}
chown lessoncue:lessoncue /var/lib/lessoncue/config
chmod 0700 /var/lib/lessoncue/config

CONFIG_FILE=/var/lib/lessoncue/config/appsettings.json
if [[ ! -f "${CONFIG_FILE}" ]]; then
  if [[ -f /opt/lessoncue/appsettings.json ]]; then
    cp /opt/lessoncue/appsettings.json "${CONFIG_FILE}"
  else
    printf '{\n  "LessonCue": {}\n}\n' > "${CONFIG_FILE}"
  fi
  chown lessoncue:lessoncue "${CONFIG_FILE}"
  chmod 0600 "${CONFIG_FILE}"
fi

PORT_FILE=/var/lib/lessoncue/config/http-port
if [[ ! -f "${PORT_FILE}" ]]; then
  printf '80\n' > "${PORT_FILE}"
  chown lessoncue:lessoncue "${PORT_FILE}"
  chmod 0600 "${PORT_FILE}"
fi
HTTP_PORT="$(cat "${PORT_FILE}")"

# Re-running the installer is the supported repair and upgrade path. Stop an
# already-running server before replacing its executable; Linux rejects writes
# to a live executable with `Text file busy`. If a later installer step fails,
# make a best effort to bring the existing service back online.
SERVICE_WAS_ACTIVE=false
restart_service_after_failure() {
  local exit_code=$?
  if [[ "${exit_code}" -ne 0 && "${SERVICE_WAS_ACTIVE}" == true ]]; then
    systemctl start lessoncue.service || true
  fi
  exit "${exit_code}"
}
trap restart_service_after_failure EXIT
if systemctl is-active --quiet lessoncue.service; then
  SERVICE_WAS_ACTIVE=true
  systemctl stop lessoncue.service
fi

install -d /opt/lessoncue
cp -a "${PAYLOAD_DIR}/." /opt/lessoncue/
chown -R root:root /opt/lessoncue
install -m 0644 "${SOURCE_DIR}/lessoncue.service" /etc/systemd/system/lessoncue.service
install -m 0644 "${SOURCE_DIR}/lessoncue-cloudflared.service" /etc/systemd/system/lessoncue-cloudflared.service
install -m 0755 "${SOURCE_DIR}/lessoncue-update" /usr/local/sbin/lessoncue-update
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 "${SOURCE_DIR}/lessoncue-media-worker" /usr/local/libexec/lessoncue-media-worker
install -m 0644 "${SOURCE_DIR}/lessoncue-update.service" /etc/systemd/system/lessoncue-update.service
install -m 0644 "${SOURCE_DIR}/lessoncue-update.path" /etc/systemd/system/lessoncue-update.path
install -m 0644 "${SOURCE_DIR}/lessoncue-update-recovery.service" /etc/systemd/system/lessoncue-update-recovery.service
if [[ ! -d /etc/lessoncue ]]; then
  install -d -o root -g root -m 0755 /etc/lessoncue
fi
install -o root -g root -m 0644 \
  "${SOURCE_DIR}/release-signing-public.pem" \
  /etc/lessoncue/release-signing-public.pem

if command -v avahi-daemon >/dev/null 2>&1; then
  AVAHI_SOURCE="${SOURCE_DIR}/docker/avahi-service.xml"
  [[ -f "${AVAHI_SOURCE}" ]] || AVAHI_SOURCE="${SOURCE_DIR}/../../docker/avahi-service.xml"
  install -m 0644 "${AVAHI_SOURCE}" /etc/avahi/services/lessoncue.service
  if [[ -f /etc/avahi/avahi-daemon.conf ]]; then
    AVAHI_HOSTNAME=lessoncue
    if [[ -f /var/lib/lessoncue/config/local-hostname ]]; then
      SAVED_HOSTNAME="$(tr -d '[:space:]' < /var/lib/lessoncue/config/local-hostname)"
      if [[ "${SAVED_HOSTNAME}" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then AVAHI_HOSTNAME="${SAVED_HOSTNAME}"; fi
    fi
    printf '%s\n' "${AVAHI_HOSTNAME}" > /var/lib/lessoncue/config/local-hostname
    printf 'hostname:%s\n' "${AVAHI_HOSTNAME}" > /var/lib/lessoncue/config/update-request
    chown lessoncue:lessoncue /var/lib/lessoncue/config/local-hostname /var/lib/lessoncue/config/update-request
    chmod 0600 /var/lib/lessoncue/config/local-hostname /var/lib/lessoncue/config/update-request
    /usr/local/sbin/lessoncue-update
  fi
fi

# Keep the checksum-verified Cloudflare connector ready even when remote access
# is still off, so enabling a tunnel never depends on a just-in-time download.
printf 'connector:prepare\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
chmod 0600 /var/lib/lessoncue/config/update-request
if ! /usr/local/sbin/lessoncue-update; then
  echo "Warning: Cloudflare connector pre-download failed. LessonCue will retry automatically each day."
fi

if command -v ufw >/dev/null 2>&1; then ufw allow "${HTTP_PORT}/tcp" >/dev/null || true; fi
systemctl daemon-reload
systemctl enable --now lessoncue-update.path
systemctl enable lessoncue-update-recovery.service
systemctl enable lessoncue
systemctl restart lessoncue
trap - EXIT
INSTALLED_VERSION="$("${PAYLOAD_DIR}/LessonCue.Server" --version 2>/dev/null || printf 'unknown')"
printf '%s\n' "${INSTALLED_VERSION}" > /var/lib/lessoncue/config/installed-version
chown lessoncue:lessoncue /var/lib/lessoncue/config/installed-version
chmod 0600 /var/lib/lessoncue/config/installed-version
if [[ "${HTTP_PORT}" == "80" ]]; then PORT_SUFFIX=""; else PORT_SUFFIX=":${HTTP_PORT}"; fi
echo "LessonCue is installed. Open http://lessoncue.local${PORT_SUFFIX}"
echo "Numeric fallback: http://$(hostname -I | awk '{print $1}')${PORT_SUFFIX}"
