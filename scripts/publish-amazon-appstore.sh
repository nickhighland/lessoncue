#!/usr/bin/env bash
# Publish a signed APK to the Amazon Appstore.
#
#   scripts/publish-amazon-appstore.sh path/to/app.apk
#
# Amazon's App Submission API works in "edits": open one, put the new APK in it,
# commit it. Committing submits the version for review the same way pressing the
# button in the Developer Console does.
#
# Two things the API cannot do, both by Amazon's design rather than ours:
#
#   * It cannot create an app. The first version has to be submitted through the
#     Developer Console; after that this takes over.
#   * It does not accept Android App Bundles. Google Play gets the .aab, Amazon
#     gets the .apk, and both are built from the same signed release.
#
# Reads from the environment:
#   AMAZON_CLIENT_ID       from the security profile's Web Settings tab
#   AMAZON_CLIENT_SECRET   likewise
#   AMAZON_APP_ID          the app's identifier in the Developer Console
#   AMAZON_API_BASE        optional, for testing against a stand-in
set -euo pipefail

APK="${1:-}"
if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "Give the path to the signed APK to publish." >&2
  exit 64
fi

: "${AMAZON_CLIENT_ID:?AMAZON_CLIENT_ID is not set}"
: "${AMAZON_CLIENT_SECRET:?AMAZON_CLIENT_SECRET is not set}"
: "${AMAZON_APP_ID:?AMAZON_APP_ID is not set}"

API_BASE="${AMAZON_API_BASE:-https://developer.amazon.com/api/appstore/v1}"
TOKEN_URL="${AMAZON_TOKEN_URL:-https://api.amazon.com/auth/o2/token}"
APP="${API_BASE}/applications/${AMAZON_APP_ID}"

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# ---------------------------------------------------------------- credentials
#
# The token is written to a file rather than passed on a command line, where it
# would be visible to anything that can list processes. Nothing here echoes it.
umask 077
curl --silent --show-error --fail-with-body \
  --data-urlencode "grant_type=client_credentials" \
  --data-urlencode "client_id=${AMAZON_CLIENT_ID}" \
  --data-urlencode "client_secret=${AMAZON_CLIENT_SECRET}" \
  --data-urlencode "scope=appstore::apps:readwrite" \
  "${TOKEN_URL}" > "${WORK}/token.json" || {
    echo "::error::Amazon refused the credentials. Check the client ID and secret in the security profile." >&2
    exit 1
  }
TOKEN="$(jq -r '.access_token // empty' < "${WORK}/token.json")"
[ -n "${TOKEN}" ] || { echo "::error::Amazon returned no access token." >&2; exit 1; }

auth=(-H "Authorization: Bearer ${TOKEN}")

# Every call goes through here so that a failure names the step it failed at
# rather than printing a bare status code.
call() {
  local what="$1" method="$2" url="$3"; shift 3
  local status
  status="$(curl --silent --show-error --output "${WORK}/body" --dump-header "${WORK}/head" \
    --write-out '%{http_code}' -X "${method}" "${auth[@]}" "$@" "${url}")"
  if [ "${status}" -lt 200 ] || [ "${status}" -ge 300 ]; then
    echo "::error::${what} failed (HTTP ${status}): $(head -c 400 "${WORK}/body")" >&2
    return 1
  fi
}

etag_of() { grep -i '^etag:' "${WORK}/head" | tail -1 | sed 's/^[Ee][Tt][Aa][Gg]:[[:space:]]*//' | tr -d '\r'; }

# ----------------------------------------------------------------------- edit
#
# An app may have only one edit open. Reusing an existing one is right rather
# than an error: a previous run that uploaded but failed to commit has left the
# work half done, and starting again would be refused.
call "Reading the open edit" GET "${APP}/edits" || exit 1
EDIT_ID="$(jq -r '.id // empty' < "${WORK}/body")"
EDIT_ETAG="$(etag_of)"

if [ -z "${EDIT_ID}" ]; then
  call "Opening an edit" POST "${APP}/edits" || exit 1
  EDIT_ID="$(jq -r '.id // empty' < "${WORK}/body")"
  EDIT_ETAG="$(etag_of)"
  echo "Opened edit ${EDIT_ID}"
else
  echo "Reusing the edit already open (${EDIT_ID})"
fi
[ -n "${EDIT_ID}" ] || { echo "::error::Amazon did not return an edit id." >&2; exit 1; }

# ------------------------------------------------------------------------ apk
call "Listing the APKs in the edit" GET "${APP}/edits/${EDIT_ID}/apks" || exit 1
APK_COUNT="$(jq 'length' < "${WORK}/body")"
APK_ID="$(jq -r '.[0].id // empty' < "${WORK}/body")"

if [ "${APK_COUNT}" -gt 1 ]; then
  echo "::error::This app has ${APK_COUNT} APKs in its edit. Which one to replace is a decision for a person, so this stops here." >&2
  exit 1
fi

if [ -n "${APK_ID}" ]; then
  # Replacing keeps the device targeting configured in the Console. Uploading a
  # second APK instead would leave the old one live alongside it.
  call "Reading the APK's ETag" GET "${APP}/edits/${EDIT_ID}/apks/${APK_ID}" || exit 1
  APK_ETAG="$(etag_of)"
  call "Replacing the APK" PUT "${APP}/edits/${EDIT_ID}/apks/${APK_ID}/replace" \
    -H "Content-Type: application/octet-stream" \
    -H "fileName: $(basename "${APK}")" \
    -H "If-Match: ${APK_ETAG}" \
    --data-binary "@${APK}" || exit 1
  echo "Replaced APK ${APK_ID}"
else
  call "Uploading the APK" POST "${APP}/edits/${EDIT_ID}/apks/upload" \
    -H "Content-Type: application/octet-stream" \
    -H "fileName: $(basename "${APK}")" \
    --data-binary "@${APK}" || exit 1
  echo "Uploaded the first APK for this edit"
fi

# --------------------------------------------------------------------- commit
#
# The edit's ETag moves as its contents change, so it is read again rather than
# reused from before the upload.
call "Re-reading the edit" GET "${APP}/edits" || exit 1
EDIT_ETAG="$(etag_of)"

call "Committing the edit" POST "${APP}/edits/${EDIT_ID}/commit" \
  -H "If-Match: ${EDIT_ETAG}" \
  -H "Content-Length: 0" || exit 1

echo "Submitted to the Amazon Appstore. It now goes through Amazon's review."
