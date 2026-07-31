#!/usr/bin/env bash
set -euo pipefail

destination="${1:?Usage: install-trivy.sh DESTINATION}"
version="${TRIVY_VERSION:-0.72.0}"
expected="${TRIVY_LINUX_X64_SHA256:-bbb64b9695866ce4a7a8f5c9592002c5961cab378577fa3f8a040df362b9b2ea}"
archive="$(mktemp)"
workdir="$(mktemp -d)"
trap 'rm -f "${archive}"; rm -rf "${workdir}"' EXIT

curl -fL \
  "https://github.com/aquasecurity/trivy/releases/download/v${version}/trivy_${version}_Linux-64bit.tar.gz" \
  -o "${archive}"
printf '%s  %s\n' "${expected}" "${archive}" | sha256sum -c -

tar -xzf "${archive}" -C "${workdir}" trivy
install -d "${destination}"
install -m 0755 "${workdir}/trivy" "${destination}/trivy"
test "$("${destination}/trivy" --version | awk '/^Version:/ { print $2 }')" = "${version}"
