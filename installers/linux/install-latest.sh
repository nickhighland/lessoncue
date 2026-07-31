#!/usr/bin/env bash
set -euo pipefail

case "$(uname -m)" in
  x86_64|amd64) runtime="linux-x64" ;;
  aarch64|arm64) runtime="linux-arm64" ;;
  *) echo "Unsupported CPU architecture: $(uname -m)"; exit 1 ;;
esac

sudo apt-get update
sudo apt-get install -y curl ca-certificates ffmpeg libreoffice-impress libreoffice-writer poppler-utils avahi-daemon libicu-dev zlib1g openssl util-linux bubblewrap
if [[ "${runtime}" == "linux-x64" ]]; then
  if apt-cache show intel-media-va-driver >/dev/null 2>&1; then
    sudo apt-get install -y intel-media-va-driver
  elif apt-cache show intel-media-va-driver-non-free >/dev/null 2>&1; then
    sudo apt-get install -y intel-media-va-driver-non-free
  fi
  if apt-cache show i965-va-driver >/dev/null 2>&1; then
    sudo apt-get install -y i965-va-driver
  fi
fi

version_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' 'https://github.com/nickhighland/lessoncue/releases/latest')"
version="${version_url##*/}"
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

echo "Downloading LessonCue ${version} for ${runtime}..."
asset="LessonCue-Server-${runtime}.tar.gz"
release_root="https://github.com/nickhighland/lessoncue/releases/download/${version}"
curl -fL "${release_root}/${asset}" -o "${workdir}/${asset}"
curl -fL "${release_root}/SHA256SUMS" -o "${workdir}/SHA256SUMS"
curl -fL "${release_root}/SHA256SUMS.sig" -o "${workdir}/SHA256SUMS.sig"
cat > "${workdir}/release-signing-public.pem" <<'LESSONCUE_RELEASE_PUBLIC_KEY'
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAbIUbCwXYdmzGOMbcmae+1fQdBoNm7im865p2Xpi6ON8=
-----END PUBLIC KEY-----
LESSONCUE_RELEASE_PUBLIC_KEY
if ! openssl pkeyutl -verify -pubin \
  -inkey "${workdir}/release-signing-public.pem" \
  -rawin -in "${workdir}/SHA256SUMS" \
  -sigfile "${workdir}/SHA256SUMS.sig"; then
  echo "LessonCue rejected this release because its Ed25519 signature is invalid."
  exit 1
fi
if ! grep -F "  ${asset}" "${workdir}/SHA256SUMS" > "${workdir}/asset.sha256"; then
  echo "The signed release manifest does not contain ${asset}."
  exit 1
fi
(cd "${workdir}" && sha256sum -c asset.sha256)
mv "${workdir}/${asset}" "${workdir}/lessoncue.tar.gz"
tar -xzf "${workdir}/lessoncue.tar.gz" -C "${workdir}"
sudo "${workdir}/install.sh"

http_port="$(sudo cat /var/lib/lessoncue/config/http-port 2>/dev/null || printf '80')"
if [[ "${http_port}" == "80" ]]; then port_suffix=""; else port_suffix=":${http_port}"; fi
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${http_port}/health/ready" >/dev/null; then
    server_ip="$(hostname -I | awk '{print $1}')"
    echo
    echo "LessonCue is ready."
    echo "Open http://lessoncue.local${port_suffix} in a browser on the same network."
    echo "Numeric fallback: http://${server_ip}${port_suffix}"
    exit 0
  fi
  sleep 1
done

echo "LessonCue did not become healthy within 30 seconds."
echo "Run: sudo journalctl -u lessoncue -n 100 --no-pager"
exit 1
