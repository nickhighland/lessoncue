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

cat > "${TEST_BIN}/diff" <<'DIFF'
#!/usr/bin/env bash
if [[ "${LESSONCUE_FAIL_SNAPSHOT:-}" == 1 ]]; then
  exit 2
fi
exec /usr/bin/diff "$@"
DIFF
chmod 0755 "${TEST_BIN}/diff"

make_server() {
  local path="$1" version="$2" marker="$3"
  cat > "${path}" <<SERVER
#!/usr/bin/env bash
case "\${1:-}" in
  --verify-database)
    if grep -q '^GOOD ' "\${2:-}"; then
      # Model Microsoft.Data.Sqlite opening a WAL-mode database read-only. It
      # creates sidecars even though the database contents are not changed.
      : > "\${2}-wal"
      : > "\${2}-shm"
    else
      exit 1
    fi ;;
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
# Model an older installed updater that already understands signed handoff but
# is byte-for-byte different from the updater in the new release. This proves
# the protected operation executes the verified release candidate before it
# starts snapshotting and then installs that candidate on success.
cp "${UPDATER_SOURCE}" /tmp/lessoncue-legacy-updater
printf '\n# legacy updater fixture\n' >> /tmp/lessoncue-legacy-updater
install -m 0755 /tmp/lessoncue-legacy-updater /usr/local/sbin/lessoncue-update

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
cp "${REPOSITORY_ROOT}/installers/linux/repair-updater.sh" "${PACKAGE_ROOT}/repair-updater.sh"
cp "${REPOSITORY_ROOT}/installers/linux/lessoncue-update-recovery.service" "${PACKAGE_ROOT}/"
cp "${TEST_PUBLIC_KEY}" "${PACKAGE_ROOT}/release-signing-public.pem"
for unit in lessoncue-update.service lessoncue-update.path lessoncue.service lessoncue-cloudflared.service; do
  printf 'new %s\n' "${unit}" > "${PACKAGE_ROOT}/${unit}"
done
case "$(uname -m)" in
  x86_64|amd64) TEST_RUNTIME=linux-x64 ;;
  aarch64|arm64) TEST_RUNTIME=linux-arm64 ;;
  *)
    echo "Unsupported test CPU architecture: $(uname -m)"
    exit 1
    ;;
esac
TEST_ASSET="LessonCue-Server-${TEST_RUNTIME}.tar.gz"
tar -C "${PACKAGE_ROOT}" -czf \
  "${RELEASE_ROOT}/releases/download/v2.0.0/${TEST_ASSET}" .
(
  cd "${RELEASE_ROOT}/releases/download/v2.0.0"
  sha256sum "${TEST_ASSET}" > SHA256SUMS
  openssl pkeyutl -sign -inkey "${TEST_PRIVATE_KEY}" -rawin \
    -in SHA256SUMS -out SHA256SUMS.sig
)

cp "${RELEASE_ROOT}/releases/download/v2.0.0/SHA256SUMS.sig" /tmp/valid-release-signature
printf 'tampered' >> "${RELEASE_ROOT}/releases/download/v2.0.0/SHA256SUMS.sig"

# Bootstrap context is accepted only from the root-owned, mode-0700 work
# directory pattern created by the parent updater. A forged context must fail
# without deleting or changing the supplied path.
install -d -o root -g root -m 0700 /tmp/untrusted-lessoncue-bootstrap
printf 'keep me\n' > /tmp/untrusted-lessoncue-bootstrap/sentinel
if env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_BOOTSTRAPPED=true \
  LESSONCUE_UPDATE_REQUEST='update:v2.0.0:test' \
  LESSONCUE_UPDATE_VERIFIED_WORKDIR=/tmp/untrusted-lessoncue-bootstrap \
  LESSONCUE_UPDATE_VERSION=v2.0.0 \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  /usr/local/sbin/lessoncue-update; then
  echo "The updater accepted an unsafe forged bootstrap context."
  exit 1
fi
test -f /tmp/untrusted-lessoncue-bootstrap/sentinel
grep -q 'unsafe protected bootstrap work directory' /var/lib/lessoncue/config/update-result.json

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

# A second systemd invocation can race the active updater while the path unit
# is still delivering a request. It must leave a durable result and consume
# the duplicate request so the web server cannot remain stuck in Installing.
printf 'update:test-lock-contention\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
exec 8>/run/lessoncue-update.lock
flock -n 8
env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_REPOSITORY="file://${RELEASE_ROOT}" \
  LESSONCUE_UPDATE_VERSION=v2.0.0 \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  /usr/local/sbin/lessoncue-update
flock -u 8
exec 8>&-
grep -q 'Another protected LessonCue operation is already in progress' \
  /var/lib/lessoncue/config/update-result.json
test ! -e /var/lib/lessoncue/config/update-request
[[ "$(/opt/lessoncue/LessonCue.Server)" == OLD ]]

printf 'update:v2.0.0:test\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_REPOSITORY="file://${RELEASE_ROOT}" \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  /usr/local/sbin/lessoncue-update | tee /tmp/lessoncue-bootstrap-output

[[ "$(/opt/lessoncue/LessonCue.Server)" == NEW ]]
[[ "$(/opt/lessoncue.previous/LessonCue.Server)" == OLD ]]
cmp -s "${UPDATER_SOURCE}" /usr/local/sbin/lessoncue-update
grep -q 'Handing the protected operation to the verified release updater before snapshotting' \
  /tmp/lessoncue-bootstrap-output
test -x "${MEDIA_WORKER}"
test -f "${MEDIA_RENDER_RULE}"
grep -q '^GOOD original database$' /var/lib/lessoncue/update-rollback/data/database/lessoncue.db
test ! -e /var/lib/lessoncue/update-rollback/data/database/lessoncue.db-wal
test ! -e /var/lib/lessoncue/update-rollback/data/database/lessoncue.db-shm
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
test ! -e /var/lib/lessoncue/manual-rollback-safety/data/database/lessoncue.db-wal
test ! -e /var/lib/lessoncue/manual-rollback-safety/data/database/lessoncue.db-shm
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

# A snapshot comparison failure must identify the phase and leave the
# installed application, data, and prior rollback snapshot untouched.
printf 'GOOD snapshot-failure database\n' > /var/lib/lessoncue/database/lessoncue.db
chown lessoncue:lessoncue /var/lib/lessoncue/database/lessoncue.db
printf 'update:test-snapshot-failure\n' > /var/lib/lessoncue/config/update-request
chown lessoncue:lessoncue /var/lib/lessoncue/config/update-request
if env \
  PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  LESSONCUE_UPDATE_REPOSITORY="file://${RELEASE_ROOT}" \
  LESSONCUE_UPDATE_VERSION=v2.0.0 \
  LESSONCUE_RELEASE_PUBLIC_KEY="${TEST_PUBLIC_KEY}" \
  LESSONCUE_FAIL_SNAPSHOT=1 \
  /usr/local/sbin/lessoncue-update; then
  echo "The updater accepted a deliberately failed snapshot comparison."
  exit 1
fi
[[ "$(/opt/lessoncue/LessonCue.Server)" == OLD ]]
grep -q '^GOOD snapshot-failure database$' /var/lib/lessoncue/database/lessoncue.db
grep -q 'Snapshot detail: the database changed or could not be compared while snapshotting' \
  /var/lib/lessoncue/config/update-result.json
test ! -e /var/lib/lessoncue/update-transaction
grep -q '^GOOD original database$' /var/lib/lessoncue/update-rollback/data/database/lessoncue.db

# The separately signed repair helper must replace only the protected updater
# and its units. It is the one-time bridge for installations whose legacy
# updater predates the verified candidate handoff above.
app_before="$(sha256sum /opt/lessoncue/LessonCue.Server)"
database_before="$(sha256sum /var/lib/lessoncue/database/lessoncue.db)"
if cmp -s "${UPDATER_SOURCE}" /usr/local/sbin/lessoncue-update; then
  echo "The updater-only repair fixture was not in its legacy state."
  exit 1
fi
exec 8>/run/lessoncue-update.lock
flock -n 8
if PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "${PACKAGE_ROOT}/repair-updater.sh" v2.0.0 > /tmp/lessoncue-repair-lock-output 2>&1; then
  echo "Updater-only repair ignored a protected-operation lock."
  exit 1
fi
flock -u 8
exec 8>&-
grep -q 'Another protected LessonCue operation is active' /tmp/lessoncue-repair-lock-output
if cmp -s "${UPDATER_SOURCE}" /usr/local/sbin/lessoncue-update; then
  echo "Updater-only repair changed the updater while the operation lock was held."
  exit 1
fi
PATH="${TEST_BIN}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  "${PACKAGE_ROOT}/repair-updater.sh" v2.0.0 | tee /tmp/lessoncue-repair-output
cmp -s "${UPDATER_SOURCE}" /usr/local/sbin/lessoncue-update
[[ "$(sha256sum /opt/lessoncue/LessonCue.Server)" == "${app_before}" ]]
[[ "$(sha256sum /var/lib/lessoncue/database/lessoncue.db)" == "${database_before}" ]]
grep -q 'application, database, and media were not replaced' /tmp/lessoncue-repair-output

echo "LessonCue release update, operator rollback, and interrupted-update recovery passed."
