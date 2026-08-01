#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "This disposable media-worker test must run as root."
  exit 1
fi

repository="${1:-/workspace}"
apt-get update >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  bubblewrap ca-certificates coreutils curl passwd util-linux >/dev/null
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
printf 'trusted input\n' > /var/lib/lessoncue/input
chown root:lessoncue /var/lib/lessoncue/input
chmod 0640 /var/lib/lessoncue/input

lessoncue_uid="$(id -u lessoncue)"
lessoncue_gid="$(id -g lessoncue)"

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

  # Ubuntu's runner policy blocks an unprivileged process from configuring
  # loopback inside a nested network namespace. Let Bubblewrap create the
  # disposable namespace as root, then drop the actual payload to the same
  # restricted service identity used in production.
  env LESSONCUE_DATA_PATH=/var/lib/lessoncue \
    /usr/local/libexec/lessoncue-media-worker "${worker_options[@]}" -- \
    /usr/bin/setpriv \
      --reuid="${lessoncue_uid}" \
      --regid="${lessoncue_gid}" \
      --clear-groups \
      -- \
      "$@"
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
