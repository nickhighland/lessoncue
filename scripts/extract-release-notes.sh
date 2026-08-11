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
  found {
    if (mode != "user") { print; next }
    if (/^### User changes[[:space:]]*$/) { user = 1; next }
    if (/^### /) {
      if (user) exit
      developer = 1
      next
    }
    if (user) {
      user_lines[++user_count] = $0
    } else if (!developer) {
      fallback_lines[++fallback_count] = $0
    }
    next
  }
  END {
    if (!found) exit 1
    if (mode == "user") {
      if (user) {
        for (i = 1; i <= user_count; i++) print user_lines[i]
      } else {
        for (i = 1; i <= fallback_count; i++) print fallback_lines[i]
      }
    }
  }
' "${changelog}"
