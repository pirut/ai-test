#!/bin/bash
set -euo pipefail

BASE_URL="${SHOWROOM_BASE_URL:-https://screen.jrbussard.com}"
NAME="${SHOWROOM_RELEASE_NAME:-}"
VERSION="${SHOWROOM_RELEASE_VERSION:-}"
NOTES="${SHOWROOM_RELEASE_NOTES:-}"
DEPLOY_TO_ALL="${SHOWROOM_DEPLOY_TO_ALL:-true}"
COOKIE="${SHOWROOM_RELEASE_COOKIE:-}"
AGENT_ARTIFACT="${SHOWROOM_AGENT_ARTIFACT:-}"
PLAYER_ARTIFACT="${SHOWROOM_PLAYER_ARTIFACT:-}"
SYSTEM_ARTIFACT="${SHOWROOM_SYSTEM_ARTIFACT:-}"

if [[ -z "${COOKIE}" ]]; then
  echo "SHOWROOM_RELEASE_COOKIE is required." >&2
  exit 1
fi

if [[ -z "${NAME}" || -z "${VERSION}" ]]; then
  echo "SHOWROOM_RELEASE_NAME and SHOWROOM_RELEASE_VERSION are required." >&2
  exit 1
fi

if [[ -z "${AGENT_ARTIFACT}" && -z "${PLAYER_ARTIFACT}" && -z "${SYSTEM_ARTIFACT}" ]]; then
  echo "Provide at least one of SHOWROOM_AGENT_ARTIFACT, SHOWROOM_PLAYER_ARTIFACT, or SHOWROOM_SYSTEM_ARTIFACT." >&2
  exit 1
fi

args=(
  -X POST
  "${BASE_URL}/api/releases/publish"
  -H "Cookie: ${COOKIE}"
  -F "name=${NAME}"
  -F "version=${VERSION}"
  -F "deployToAll=${DEPLOY_TO_ALL}"
)

if [[ -n "${NOTES}" ]]; then
  args+=( -F "notes=${NOTES}" )
fi

if [[ -n "${AGENT_ARTIFACT}" ]]; then
  args+=( -F "agent=@${AGENT_ARTIFACT}" )
fi

if [[ -n "${PLAYER_ARTIFACT}" ]]; then
  args+=( -F "player=@${PLAYER_ARTIFACT}" )
fi

if [[ -n "${SYSTEM_ARTIFACT}" ]]; then
  args+=( -F "system=@${SYSTEM_ARTIFACT}" )
fi

curl --fail-with-body "${args[@]}"
