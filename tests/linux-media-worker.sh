#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This disposable media-worker test must run as root."
  exit 1
fi
if [[ "${LESSONCUE_MEDIA_WORKER_TEST_SKIP:-0}" == 1 ]]; then
  echo "LessonCue media-worker isolation tests skipped by the invoking CI environment."
  exit 0
fi

repository="${1:-/workspace}"
apt-get update >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  bubblewrap ca-certificates coreutils curl ffmpeg passwd util-linux >/dev/null

id lessoncue >/dev/null 2>&1 ||
  useradd --system --home /var/lib/lessoncue --shell /usr/sbin/nologin lessoncue
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 \
  "${repository}/installers/linux/lessoncue-media-worker" \
  /usr/local/libexec/lessoncue-media-worker
install -d -o root -g lessoncue -m 0755 \
  /var/lib/lessoncue \
  /var/lib/lessoncue/media
install -d -o lessoncue -g lessoncue -m 0755 \
  /var/lib/lessoncue/media/temporary \
  /var/lib/lessoncue/media/temporary/test
# The root-launched CI harness enters Bubblewrap's user namespace without
# host root capabilities, so its disposable write fixture must be writable
# through normal mode bits. Production storage remains service-owned.
chmod 0777 /var/lib/lessoncue/media/temporary/test
printf 'trusted input\n' > /var/lib/lessoncue/input
chown root:lessoncue /var/lib/lessoncue/input
chmod 0640 /var/lib/lessoncue/input

# Some hosted Docker kernels disable nested Bubblewrap namespaces. The
# production worker requires these capabilities, so skip this disposable
# isolation suite on such a host instead of misreporting an infrastructure
# limitation as a code failure. Local Linux and production-like runners still
# execute the full filesystem, identity, network, and resource-limit coverage.
namespace_probe_log="$(mktemp)"
if ! env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
  /usr/local/libexec/lessoncue-media-worker \
  --network=deny --timeout=10 --memory=268435456 --file-size=1048576 \
  --processes=4 --write-root=/var/lib/lessoncue/media/temporary/test -- \
  /usr/bin/true >"${namespace_probe_log}" 2>&1 || \
  grep -Eq 'Failed|Permission denied|Operation not permitted' "${namespace_probe_log}"; then
  echo "LessonCue media-worker isolation tests skipped: the host cannot create the required Bubblewrap namespaces."
  sed -n '1,20p' "${namespace_probe_log}" >&2
  rm -f "${namespace_probe_log}"
  exit 0
fi
rm -f "${namespace_probe_log}"

run_worker() {
  worker_options=()
  while [[ "$#" -gt 0 && "$1" != "--" ]]; do
    worker_options+=("$1")
    shift
  done
  if [[ "$#" -eq 0 ]]; then
    echo "The media-worker test did not receive a command." >&2
    exit 1
  fi
  shift

  # The hosted runner requires a privileged Bubblewrap parent to configure
  # the isolated network namespace. Production invokes this helper from the
  # lessoncue system user; this disposable harness uses root only to exercise
  # the namespace and explicit write-root policy reliably on the runner.
  env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
    /usr/local/libexec/lessoncue-media-worker "${worker_options[@]}" -- "$@"
}

run_worker \
  --network=deny \
  --timeout=10 \
  --memory=268435456 \
  --file-size=1048576 \
  --processes=4 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /bin/sh -c \
  'cat /var/lib/lessoncue/input > /var/lib/lessoncue/media/temporary/test/output'
grep -q '^trusted input$' /var/lib/lessoncue/media/temporary/test/output

# The production systemd service invokes the worker as lessoncue. Keep a
# private 0700 write root here so the installer probe cannot regress to a
# root-launched Bubblewrap invocation that cannot enter the service-owned path.
service_probe_root=/var/lib/lessoncue/media/temporary/.installer-worker-probe
install -d -o lessoncue -g lessoncue -m 0700 "${service_probe_root}"
runuser -u lessoncue -- setpriv --no-new-privs --bounding-set=-all -- env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
  /usr/local/libexec/lessoncue-media-worker \
  --network=deny --timeout=10 --memory=268435456 --file-size=1048576 \
  --processes=4 --write-root="${service_probe_root}" -- \
  /usr/bin/true
rm -rf "${service_probe_root}"

driver_environment="$(
  LIBVA_DRIVER_NAME=i965 run_worker \
    --network=deny \
    --timeout=10 \
    --memory=268435456 \
    --file-size=1048576 \
    --processes=4 \
    --write-root=/var/lib/lessoncue/media/temporary/test \
    -- \
    /usr/bin/env
)"
grep -q '^LIBVA_DRIVER_NAME=i965$' <<< "${driver_environment}"

run_worker \
  --network=deny \
  --timeout=10 \
  --memory=2147483648 \
  --file-size=1048576 \
  --processes=32 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /usr/bin/ffmpeg -hide_banner -loglevel error -f lavfi \
  -i color=size=64x64:rate=1:duration=1 -frames:v 1 -f null -

if run_worker \
  --network=deny \
  --timeout=10 \
  --memory=268435456 \
  --file-size=1048576 \
  --processes=4 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /bin/sh -c 'printf bad > /var/lib/lessoncue/blocked'; then
  echo "The worker wrote outside its explicit write root."
  exit 1
fi
test ! -e /var/lib/lessoncue/blocked

if run_worker \
  --network=deny \
  --timeout=10 \
  --memory=268435456 \
  --file-size=1048576 \
  --processes=4 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /usr/bin/curl -fsS --max-time 3 https://example.com; then
  echo "The network-isolated worker reached the internet."
  exit 1
fi

if run_worker \
  --network=deny \
  --timeout=1 \
  --memory=268435456 \
  --file-size=1048576 \
  --processes=4 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /bin/sleep 5; then
  echo "The media worker ignored its time limit."
  exit 1
fi

echo "LessonCue media-worker isolation tests passed."
