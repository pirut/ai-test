#!/bin/bash
set -euo pipefail

MARKER_PATH="/var/lib/showroom/hostname-initialized"
PREFIX_RAW="${SHOWROOM_HOSTNAME_PREFIX:-showroom}"
FIXED_HOSTNAME_RAW="${SHOWROOM_HOSTNAME_FIXED:-}"
UNIQUE_HOSTNAME="${SHOWROOM_UNIQUE_HOSTNAME:-1}"

sanitize_hostname() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9-' '-')"
  value="${value#-}"
  value="${value%-}"
  if [[ -z "${value}" ]]; then
    value="showroom"
  fi
  printf '%.63s' "${value}"
}

unique_suffix() {
  local source=""

  if [[ -r /proc/device-tree/serial-number ]]; then
    source="$(tr -d '\000\r\n' </proc/device-tree/serial-number)"
  fi

  if [[ -z "${source}" && -r /sys/class/net/eth0/address ]]; then
    source="$(tr -d ':\r\n' </sys/class/net/eth0/address)"
  fi

  if [[ -z "${source}" && -r /sys/class/net/wlan0/address ]]; then
    source="$(tr -d ':\r\n' </sys/class/net/wlan0/address)"
  fi

  if [[ -z "${source}" && -r /etc/machine-id ]]; then
    source="$(tr -d '\r\n' </etc/machine-id)"
  fi

  if [[ -z "${source}" ]]; then
    source="$(date +%s)"
  fi

  source="$(printf '%s' "${source}" | tr '[:upper:]' '[:lower:]')"
  printf '%s' "${source: -4}"
}

apply_hostname() {
  local hostname="$1"
  printf '%s\n' "${hostname}" >/etc/hostname

  if grep -q '^127\.0\.1\.1[[:space:]]' /etc/hosts; then
    sed -i -E "s/^127\.0\.1\.1[[:space:]].*/127.0.1.1\t${hostname}/" /etc/hosts
  else
    printf '127.0.1.1\t%s\n' "${hostname}" >>/etc/hosts
  fi

  hostname "${hostname}"
}

mkdir -p /var/lib/showroom

if [[ "${UNIQUE_HOSTNAME}" != "1" ]]; then
  touch "${MARKER_PATH}"
  exit 0
fi

fixed_hostname="$(sanitize_hostname "${FIXED_HOSTNAME_RAW}")"
prefix="$(sanitize_hostname "${PREFIX_RAW}")"

if [[ -n "${FIXED_HOSTNAME_RAW}" ]]; then
  desired_hostname="${fixed_hostname}"
else
  desired_hostname="$(sanitize_hostname "${prefix}-$(unique_suffix)")"
fi

current_hostname="$(hostname -s 2>/dev/null || hostname)"
if [[ "${current_hostname}" != "${desired_hostname}" ]]; then
  apply_hostname "${desired_hostname}"
fi

touch "${MARKER_PATH}"
