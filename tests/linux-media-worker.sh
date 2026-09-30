#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This disposable media-worker test must run as root."
  exit 1
fi

repository="${1:-/workspace}"
apt-get update >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates coreutils ffmpeg passwd util-linux >/dev/null

id lessoncue >/dev/null 2>&1 ||
  useradd --system --home /var/lib/lessoncue --shell /usr/sbin/nologin lessoncue
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 \
  "${repository}/installers/linux/lessoncue-media-worker" \
  /usr/local/libexec/lessoncue-media-worker
install -d -o root -g lessoncue -m 0755 \
  /var/lib/lessoncue \
  /var/lib/lessoncue/media
install -d -o lessoncue -g lessoncue -m 0700 \
  /var/lib/lessoncue/media/temporary \
  /var/lib/lessoncue/media/temporary/test
printf 'trusted input\n' > /var/lib/lessoncue/input
chown root:lessoncue /var/lib/lessoncue/input
chmod 0640 /var/lib/lessoncue/input

run_worker() {
  local -a worker_options=()
  while [[ "$#" -gt 0 && "$1" != "--" ]]; do
    worker_options+=("$1")
    shift
  done
  if [[ "$#" -eq 0 ]]; then
    echo "The media-worker test did not receive a command." >&2
    exit 1
  fi
  shift

  # Match the native systemd service: the helper is unprivileged and the
  # inherited port-binding capability is cleared before the converter starts.
  runuser -u lessoncue -- setpriv --ambient-caps=-all --inh-caps=-all --no-new-privs -- \
    env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
    /usr/local/libexec/lessoncue-media-worker "${worker_options[@]}" -- "$@"
}

run_worker \
  --network=deny \
  --timeout=10 \
  --memory=268435456 \
  --file-size=1048576 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /bin/sh -c \
  'cat /var/lib/lessoncue/input > /var/lib/lessoncue/media/temporary/test/output'
grep -q '^trusted input$' /var/lib/lessoncue/media/temporary/test/output

driver_environment="$(
  LIBVA_DRIVER_NAME=i965 run_worker \
    --network=deny \
    --timeout=10 \
    --memory=268435456 \
    --file-size=1048576 \
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
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /usr/bin/ffmpeg -hide_banner -loglevel error -f lavfi \
  -i color=size=64x64:rate=1:duration=1 -frames:v 1 -f null -

if run_worker \
  --network=deny \
  --timeout=1 \
  --memory=268435456 \
  --file-size=1048576 \
  --write-root=/var/lib/lessoncue/media/temporary/test \
  -- \
  /bin/sh -c 'sleep 3'; then
  echo "The worker did not enforce its wall-time limit." >&2
  exit 1
fi

if run_worker \
  --network=deny \
  --timeout=10 \
  --memory=268435456 \
  --file-size=1048576 \
  --write-root=/etc \
  -- \
  /usr/bin/true; then
  echo "The worker accepted a write root outside LessonCue data." >&2
  exit 1
fi

echo "LessonCue bounded media worker checks passed without Bubblewrap."
