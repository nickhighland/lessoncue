#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This integration test must run as root inside its disposable container."
  exit 1
fi

REPOSITORY_ROOT="${1:-/workspace}"
UPDATER_SOURCE="${REPOSITORY_ROOT}/installers/linux/lessoncue-update"
TEST_BIN=/tmp/lessoncue-test-bin
RELEASE_ROOT=/tmp/lessoncue-releases
PACKAGE_ROOT=/tmp/lessoncue-package
TEST_PRIVATE_KEY=/tmp/lessoncue-test-release-private.pem
TEST_PUBLIC_KEY=/tmp/lessoncue-test-release-public.pem
MEDIA_WORKER=/usr/local/libexec/lessoncue-media-worker
MEDIA_RENDER_RULE=/etc/udev/rules.d/99-lessoncue-render.rules

apt-get update >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates curl diffutils openssl passwd util-linux >/dev/null

id lessoncue >/dev/null 2>&1 ||
  useradd --system --home /var/lib/lessoncue --shell /usr/sbin/nologin lessoncue

install -d "${TEST_BIN}" /opt/lessoncue /var/lib/lessoncue/{database,config} \
  /etc/lessoncue /etc/udev/rules.d /etc/systemd/system /usr/local/sbin /usr/local/libexec
rm -f "${MEDIA_WORKER}"
rm -f "${MEDIA_RENDER_RULE}"

cat > "${TEST_BIN}/systemctl" <<'SYSTEMCTL'
#!/usr/bin/env bash
exit 0
SYSTEMCTL
chmod 0755 "${TEST_BIN}/systemctl"

cat > "${TEST_BIN}/curl" <<'CURL'
#!/usr/bin/env bash
for argument in "$@"; do
  if [[ "${argument}" == http://127.0.0.1:*/health/ready ]]; then
    if [[ -f /tmp/lessoncue-reject-new ]] &&
       [[ "$(/opt/lessoncue/LessonCue.Server 2>/dev/null || true)" == NEW ]]; then
      exit 22
    fi
    exit 0
  fi
done
exec /usr/bin/curl "$@"
CURL
chmod 0755 "${TEST_BIN}/curl"

make_server() {
  local path="$1" version="$2" marker="$3"
  cat > "${path}" <<SERVER
#!/usr/bin/env bash
case "\${1:-}" in
  --verify-database)
    grep -q '^GOOD ' "\${2:-}" ;;
  --version)
    printf '%s\\n' '${version}' ;;
  *)
    printf '%s\\n' '${marker}' ;;
esac
SERVER
  chmod 0755 "${path}"
}

make_server /opt/lessoncue/LessonCue.Server 1.0.0 OLD
printf 'GOOD original database\n' > /var/lib/lessoncue/database/lessoncue.db
printf '80\n' > /var/lib/lessoncue/config/http-port
printf '1.0.0\n' > /var/lib/lessoncue/config/installed-version
printf '{"name":"before"}\n' > /var/lib/lessoncue/config/appsettings.json
chown -R lessoncue:lessoncue /var/lib/lessoncue
printf 'old updater unit\n' > /etc/systemd/system/lessoncue-update.service
printf 'old updater path\n' > /etc/systemd/system/lessoncue-update.path
printf 'old server unit\n' > /etc/systemd/system/lessoncue.service
printf 'old tunnel unit\n' > /etc/systemd/system/lessoncue-cloudflared.service
printf 'protected token\n' > /etc/lessoncue/example
install -m 0755 "${UPDATER_SOURCE}" /usr/local/sbin/lessoncue-update

install -d "${PACKAGE_ROOT}/payload" "${RELEASE_ROOT}/releases/download/v2.0.0"
openssl genpkey -algorithm Ed25519 -out "${TEST_PRIVATE_KEY}" 2>/dev/null
openssl pkey -in "${TEST_PRIVATE_KEY}" -pubout -out "${TEST_PUBLIC_KEY}" 2>/dev/null
make_server "${PACKAGE_ROOT}/payload/LessonCue.Server" 2.0.0 NEW
cp "${REPOSITORY_ROOT}/installers/linux/lessoncue-media-worker" "${PACKAGE_ROOT}/lessoncue-media-worker"
chmod 0755 "${PACKAGE_ROOT}/lessoncue-media-worker"
cp "${REPOSITORY_ROOT}/installers/linux/lessoncue-media-worker" "${PACKAGE_ROOT}/payload/lessoncue-media-worker"
chmod 0755 "${PACKAGE_ROOT}/payload/lessoncue-media-worker"
cp "${REPOSITORY_ROOT}/installers/linux/lessoncue-render.rules" "${PACKAGE_ROOT}/lessoncue-render.rules"
cp "${UPDATER_SOURCE}" "${PACKAGE_ROOT}/lessoncue-update"
cp "${REPOSITORY_ROOT}/installers/linux/lessoncue-update-recovery.service" "${PACKAGE_ROOT}/"
for unit in lessoncue-update.service lessoncue-update.path lessoncue.service lessoncue-cloudflared.service; do
  printf 'new %s\n' "${unit}" > "${PACKAGE_ROOT}/${unit}"
done
tar -C "${PACKAGE_ROOT}" -czf \
  "${RELEASE_ROOT}/releases/download/v2.0.0/LessonCue-Server-linux-x64.tar.gz" .
(
  cd "${RELEASE_ROOT}/releases/download/v2.0.0"
  sha256sum LessonCue-Server-linux-x64.tar.gz > SHA256SUMS
  openssl pkeyutl -sign -inkey "${TEST_PRIVATE_KEY}" -rawin \
    -in SHA256SUMS -out SHA256SUMS.sig
)

cp "${RELEASE_ROOT}/releases/download/v2.0.0/SHA256SUMS.sig" /tmp/valid-release-signature
printf 'tampered' >> "${RELEASE_ROOT}/releases/download/v2.0.0/SHA256SUMS.sig"
printf 'update:test-invalid-signature\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
if env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_REPOSITORY="file://${RELEASE_ROOT}" \
  LESSONCUE_UPDATE_VERSION=v2.0.0 \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  /usr/local/sbin/lessoncue-update; then
  echo "The updater accepted a deliberately invalid release signature."
  exit 1
fi
[[ "$(/opt/lessoncue/LessonCue.Server)" == OLD ]]
grep -q '"success":false' /var/lib/lessoncue/config/update-result.json
grep -q 'Ed25519 signature is invalid' /var/lib/lessoncue/config/update-result.json
test ! -e /var/lib/lessoncue/update-transaction
mv /tmp/valid-release-signature \
  "${RELEASE_ROOT}/releases/download/v2.0.0/SHA256SUMS.sig"

printf 'update:test\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_REPOSITORY="file://${RELEASE_ROOT}" \
  LESSONCUE_UPDATE_VERSION=v2.0.0 \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  /usr/local/sbin/lessoncue-update

[[ "$(/opt/lessoncue/LessonCue.Server)" == NEW ]]
[[ "$(/opt/lessoncue.previous/LessonCue.Server)" == OLD ]]
test -x "${MEDIA_WORKER}"
test -f "${MEDIA_RENDER_RULE}"
grep -q '^GOOD original database$' /var/lib/lessoncue/update-rollback/data/database/lessoncue.db
grep -q '"success":true' /var/lib/lessoncue/config/update-result.json
grep -q '^2.0.0$' /var/lib/lessoncue/config/installed-version
test ! -e /var/lib/lessoncue/update-transaction

printf 'GOOD post-update database\n' > /var/lib/lessoncue/database/lessoncue.db
chown lessoncue:lessoncue /var/lib/lessoncue/database/lessoncue.db
printf 'rollback:test\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
env PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  /usr/local/sbin/lessoncue-update

[[ "$(/opt/lessoncue/LessonCue.Server)" == OLD ]]
[[ "$(/opt/lessoncue.failed/LessonCue.Server)" == NEW ]]
test ! -e "${MEDIA_WORKER}"
test ! -e "${MEDIA_RENDER_RULE}"
grep -q '^GOOD original database$' /var/lib/lessoncue/database/lessoncue.db
grep -q '^GOOD post-update database$' \
  /var/lib/lessoncue/manual-rollback-safety/data/database/lessoncue.db
grep -q '"success":true' /var/lib/lessoncue/config/update-result.json
test ! -e /var/lib/lessoncue/update-transaction

# Inject a readiness failure after the application swap. The updater must
# restore the old binary, database, configuration, and system files before it
# reports failure.
touch /tmp/lessoncue-reject-new
printf 'update:test\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
if env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_REPOSITORY="file://${RELEASE_ROOT}" \
  LESSONCUE_UPDATE_VERSION=v2.0.0 \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  LESSONCUE_UPDATE_READINESS_ATTEMPTS=1 \
  LESSONCUE_UPDATE_READINESS_DELAY_SECONDS=0 \
  /usr/local/sbin/lessoncue-update; then
  echo "The deliberately unhealthy release unexpectedly succeeded."
  exit 1
fi
rm -f /tmp/lessoncue-reject-new

[[ "$(/opt/lessoncue/LessonCue.Server)" == OLD ]]
test ! -e "${MEDIA_WORKER}"
test ! -e "${MEDIA_RENDER_RULE}"
grep -q '^GOOD original database$' /var/lib/lessoncue/database/lessoncue.db
grep -q '"success":false' /var/lib/lessoncue/config/update-result.json
test ! -e /var/lib/lessoncue/update-transaction

mv /opt/lessoncue /opt/lessoncue.previous
mv /opt/lessoncue.failed /opt/lessoncue
printf 'GOOD interrupted database\n' > /var/lib/lessoncue/database/lessoncue.db
chown lessoncue:lessoncue /var/lib/lessoncue/database/lessoncue.db
printf 'update:v2.0.0:test\n' > /var/lib/lessoncue/update-transaction
chmod 0600 /var/lib/lessoncue/update-transaction
env PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  /usr/local/sbin/lessoncue-update --recover

[[ "$(/opt/lessoncue/LessonCue.Server)" == OLD ]]
grep -q '^GOOD original database$' /var/lib/lessoncue/database/lessoncue.db
grep -q '"success":false' /var/lib/lessoncue/config/update-result.json
test ! -e /var/lib/lessoncue/update-transaction

echo "LessonCue release update, operator rollback, and interrupted-update recovery passed."
