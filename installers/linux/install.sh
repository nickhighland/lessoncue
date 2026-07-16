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

install -d /opt/lessoncue
cp -a "${PAYLOAD_DIR}/." /opt/lessoncue/
chown -R root:root /opt/lessoncue
install -m 0644 "${SOURCE_DIR}/lessoncue.service" /etc/systemd/system/lessoncue.service
install -m 0755 "${SOURCE_DIR}/lessoncue-update" /usr/local/sbin/lessoncue-update
install -m 0644 "${SOURCE_DIR}/lessoncue-update.service" /etc/systemd/system/lessoncue-update.service
install -m 0644 "${SOURCE_DIR}/lessoncue-update.path" /etc/systemd/system/lessoncue-update.path

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

if command -v ufw >/dev/null 2>&1; then ufw allow "${HTTP_PORT}/tcp" >/dev/null || true; fi
systemctl daemon-reload
systemctl enable --now lessoncue-update.path
systemctl enable lessoncue
systemctl restart lessoncue
if [[ "${HTTP_PORT}" == "80" ]]; then PORT_SUFFIX=""; else PORT_SUFFIX=":${HTTP_PORT}"; fi
echo "LessonCue is installed. Open http://lessoncue.local${PORT_SUFFIX}"
echo "Numeric fallback: http://$(hostname -I | awk '{print $1}')${PORT_SUFFIX}"
