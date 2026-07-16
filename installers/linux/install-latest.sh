#!/usr/bin/env bash
set -euo pipefail

case "$(uname -m)" in
  x86_64|amd64) runtime="linux-x64" ;;
  aarch64|arm64) runtime="linux-arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)"; exit 1 ;;
esac

sudo apt-get update
sudo apt-get install -y curl ca-certificates ffmpeg avahi-daemon libicu-dev zlib1g openssl util-linux

version_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' 'https://github.com/nickhighland/lessoncue/releases/latest')"
version="${version_url##*/}"
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

echo "Downloading LessonCue ${version} for ${runtime}..."
curl -fL "https://github.com/nickhighland/lessoncue/releases/download/${version}/LessonCue-Server-${runtime}.tar.gz" -o "${workdir}/lessoncue.tar.gz"
tar -xzf "${workdir}/lessoncue.tar.gz" -C "${workdir}"
sudo "${workdir}/install.sh"

for attempt in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null; then
    server_ip="$(hostname -I | awk '{print $1}')"
    echo
    echo "LessonCue is ready."
    echo "Open http://${server_ip}:8080 in a browser on the same network."
    exit 0
  fi
  sleep 1
done

echo "LessonCue did not become healthy within 30 seconds."
echo "Run: sudo journalctl -u lessoncue -n 100 --no-pager"
exit 1
