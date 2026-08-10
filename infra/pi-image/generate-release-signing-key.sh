#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
KEY_DIR="${SHOWROOM_KEY_DIR:-${ROOT_DIR}/secrets}"
KEY_ID="${SHOWROOM_RELEASE_SIGNING_KEY_ID:-production-$(date -u +%Y)}"
OPENSSL_BIN="${SHOWROOM_OPENSSL:-openssl}"
if [[ "$(uname -s)" == "Darwin" && -x /opt/homebrew/opt/openssl@3/bin/openssl ]]; then
  OPENSSL_BIN="${SHOWROOM_OPENSSL:-/opt/homebrew/opt/openssl@3/bin/openssl}"
fi

mkdir -p "${KEY_DIR}"
umask 077
if [[ -e "${KEY_DIR}/release-private.pem" ]]; then
  echo "Refusing to overwrite ${KEY_DIR}/release-private.pem" >&2
  exit 1
fi

"${OPENSSL_BIN}" genpkey -algorithm ED25519 -out "${KEY_DIR}/release-private.pem"
"${OPENSSL_BIN}" pkey -in "${KEY_DIR}/release-private.pem" -pubout -out "${KEY_DIR}/release-public.pem"
"${OPENSSL_BIN}" pkey -pubin -in "${KEY_DIR}/release-public.pem" -outform DER \
  | tail -c 32 \
  | base64 > "${KEY_DIR}/release-public.base64"
printf '%s\n' "${KEY_ID}" > "${KEY_DIR}/release-key-id"

echo "Created an Ed25519 release keypair in ${KEY_DIR}."
echo "Keep release-private.pem only in the deployment secret store."
echo "Bake release-public.base64 into SHOWROOM_RELEASE_PUBLIC_KEY for every appliance image."
