#!/bin/bash
# Creates a RAUC signing CA and a bundle-signing key for Showroom OS.
#
#   ./infra/buildroot/generate-rauc-keys.sh DIR
#
# DIR/ca.cert.pem goes into the image as /etc/rauc/keyring.pem; screens accept
# only bundles signed under it. DIR/signing.cert.pem and DIR/signing.key.pem
# sign bundles. For production, run this once, keep ca.key.pem offline, and
# store the signing pair as build secrets. CI builds without those secrets
# make a throwaway set, so their bundles only install on their own images.
set -euo pipefail

dir="${1:?usage: generate-rauc-keys.sh DIR}"
subject="${SHOWROOM_RAUC_SUBJECT:-/O=Showroom/CN=Showroom OS}"
mkdir -p "${dir}"
umask 077

openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "${dir}/ca.key.pem" -out "${dir}/ca.cert.pem" -days 7300 \
  -subj "${subject} CA" \
  -addext "basicConstraints=critical,CA:true" \
  -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
  -keyout "${dir}/signing.key.pem" -out "${dir}/signing.csr.pem" \
  -subj "${subject} bundle signing"

# No extendedKeyUsage, so RAUC's default purpose check accepts the key.
openssl x509 -req -in "${dir}/signing.csr.pem" \
  -CA "${dir}/ca.cert.pem" -CAkey "${dir}/ca.key.pem" -CAcreateserial \
  -out "${dir}/signing.cert.pem" -days 3650 \
  -extfile <(printf 'basicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature\n')

rm -f "${dir}/signing.csr.pem" "${dir}/ca.cert.srl"
chmod 0644 "${dir}/ca.cert.pem" "${dir}/signing.cert.pem"
echo "RAUC keys written to ${dir}"
