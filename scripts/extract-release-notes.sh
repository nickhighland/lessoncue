#!/usr/bin/env bash
set -euo pipefail

tag="${1:?release tag is required}"
changelog="${2:-CHANGELOG.md}"

awk -v tag="${tag}" '
  $0 ~ "^## " tag "([[:space:]]|$)" { found = 1; next }
  found && /^## / { exit }
  found { print }
  END { if (!found) exit 1 }
' "${changelog}"
