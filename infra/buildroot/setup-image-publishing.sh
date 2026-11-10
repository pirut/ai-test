#!/bin/bash
# One-time setup so CI publishes Showroom OS images and test screens update
# themselves. Run it on your own computer with the GitHub CLI signed in
# (gh auth login):
#
#   ./infra/buildroot/setup-image-publishing.sh
#
# It
#   1. creates the public images repository (default pirut/showroom-os),
#   2. makes the development OS signing keys and stores them as secrets of
#      the source repository, so every CI build of a development image can
#      update the test screens flashed with an earlier one,
#   3. asks for a fine-grained token that can write to the images
#      repository and stores it as the SHOWROOM_IMAGES_TOKEN secret.
#
# With --production it also makes the production OS signing keys, stores the
# signing pair and CA certificate as secrets, and leaves the CA private key
# in ~/showroom-rauc-production for you to move somewhere offline.
#
# Secrets go straight from this computer to GitHub; nothing is printed.
# Re-running skips what is already set up. --rotate-dev-keys replaces the
# development keys; test screens then need one reflash.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_REPO="${SHOWROOM_SOURCE_REPO:-pirut/ai-test}"
IMAGES_REPO="${SHOWROOM_IMAGES_REPO:-pirut/showroom-os}"
production=0
rotate_dev=0
for arg in "$@"; do
  case "${arg}" in
    --production) production=1 ;;
    --rotate-dev-keys) rotate_dev=1 ;;
    *) echo "usage: $0 [--production] [--rotate-dev-keys]" >&2; exit 2 ;;
  esac
done

command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com" >&2; exit 1; }
command -v openssl >/dev/null || { echo "openssl is required" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Sign in first: gh auth login" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "${work}"' EXIT
umask 077
existing="$(gh secret list -R "${SOURCE_REPO}" --json name --jq '.[].name')"
has_secret() { grep -qxF "$1" <<<"${existing}"; }

echo "1. Images repository ${IMAGES_REPO}"
if gh repo view "${IMAGES_REPO}" >/dev/null 2>&1; then
  echo "   already exists"
else
  gh repo create "${IMAGES_REPO}" --public --add-readme \
    --description "Showroom OS images for Raspberry Pi 5 screens (downloads only)"
fi

echo "2. Development OS signing keys"
if has_secret SHOWROOM_RAUC_DEV_SIGNING_KEY && [[ "${rotate_dev}" == 0 ]]; then
  echo "   already stored (use --rotate-dev-keys to replace them)"
else
  "${ROOT_DIR}/generate-rauc-keys.sh" "${work}/dev" >/dev/null 2>&1
  gh secret set SHOWROOM_RAUC_DEV_CA_CERT -R "${SOURCE_REPO}" <"${work}/dev/ca.cert.pem"
  gh secret set SHOWROOM_RAUC_DEV_SIGNING_CERT -R "${SOURCE_REPO}" <"${work}/dev/signing.cert.pem"
  gh secret set SHOWROOM_RAUC_DEV_SIGNING_KEY -R "${SOURCE_REPO}" <"${work}/dev/signing.key.pem"
  echo "   stored; the development CA private key was not kept"
fi

echo "3. Publishing token"
if has_secret SHOWROOM_IMAGES_TOKEN; then
  echo "   already stored"
else
  cat <<EOF
   Create a fine-grained token at
     https://github.com/settings/personal-access-tokens/new
   Name: Showroom OS publishing. Resource owner: ${IMAGES_REPO%%/*}.
   Repository access: only ${IMAGES_REPO}. Permissions: Contents, read and write.
EOF
  read -r -s -p "   Paste the token (it is not shown): " token
  echo
  [[ -n "${token}" ]] || { echo "No token given" >&2; exit 1; }
  if ! GH_TOKEN="${token}" gh api "repos/${IMAGES_REPO}" --jq '.permissions.push' 2>/dev/null | grep -qx true; then
    echo "That token cannot write to ${IMAGES_REPO}" >&2
    exit 1
  fi
  printf '%s' "${token}" | gh secret set SHOWROOM_IMAGES_TOKEN -R "${SOURCE_REPO}"
  unset token
  echo "   stored"
fi

if [[ "${production}" == 1 ]]; then
  echo "4. Production OS signing keys"
  if has_secret SHOWROOM_RAUC_SIGNING_KEY; then
    echo "   already stored; not replacing production keys"
  else
    keep="${HOME}/showroom-rauc-production"
    [[ ! -e "${keep}" ]] || { echo "${keep} already exists; move it away first" >&2; exit 1; }
    "${ROOT_DIR}/generate-rauc-keys.sh" "${keep}" >/dev/null 2>&1
    gh secret set SHOWROOM_RAUC_CA_CERT -R "${SOURCE_REPO}" <"${keep}/ca.cert.pem"
    gh secret set SHOWROOM_RAUC_SIGNING_CERT -R "${SOURCE_REPO}" <"${keep}/signing.cert.pem"
    gh secret set SHOWROOM_RAUC_SIGNING_KEY -R "${SOURCE_REPO}" <"${keep}/signing.key.pem"
    rm -f "${keep}/signing.key.pem"
    echo "   stored; move ${keep}/ca.key.pem offline (it can issue new signing keys)"
  fi
fi

echo
echo "Done. The next image build in ${SOURCE_REPO} publishes to the dev channel:"
echo "  https://github.com/${IMAGES_REPO}/releases/tag/dev"
echo "Flash showroom-os-rpi5-dev.img.xz from there onto the test screen once; it installs every later build itself."
