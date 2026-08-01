#!/usr/bin/env bash
set -euo pipefail

mode="all"
if [[ "${1:-}" == "--user" ]]; then
  mode="user"
  shift
fi

tag="${1:?release tag is required}"
changelog="${2:-CHANGELOG.md}"

awk -v tag="${tag}" -v mode="${mode}" '
  $0 ~ "^## " tag "([[:space:]]|$)" { found = 1; next }
  found && /^## / { exit }
  found && mode == "user" && /^### User changes[[:space:]]*$/ { user = 1; next }
  found && mode == "user" && user && /^### / { exit }
  found && mode == "user" { if (user) print; next }
  found { print }
  END {
    if (!found || (mode == "user" && !user)) exit 1
  }
' "${changelog}"
