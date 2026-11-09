#!/bin/bash
# Runs board/rpi5/post-image.sh against stand-in kernel, firmware and root
# filesystem files to check the card layout and the signed RAUC bundle
# without a full Buildroot build. Needs genimage, rauc, mkfs.erofs, mtools,
# dosfstools, e2fsprogs, squashfs-tools and sfdisk.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
IMAGES="${WORK}/images"
VERSION=dry-run

mkdir -p "${IMAGES}/rpi-firmware/overlays" "${WORK}/build" "${WORK}/host/bin" "${WORK}/rootfs/etc"
ln -s "$(command -v rauc)" "${WORK}/host/bin/rauc"
head -c 20M /dev/urandom >"${IMAGES}/Image"
for dtb in bcm2712-rpi-5-b.dtb bcm2712d0-rpi-5-b.dtb; do
  head -c 80K /dev/urandom >"${IMAGES}/${dtb}"
done
cp "${ROOT_DIR}/board/rpi5/config.txt" "${IMAGES}/rpi-firmware/config.txt"
for overlay in vc4-kms-v3d.dtbo vc4-kms-v3d-pi5.dtbo hifiberry-dac.dtbo overlay_map.dtb; do
  head -c 4K /dev/urandom >"${IMAGES}/rpi-firmware/overlays/${overlay}"
done
head -c 30M /dev/urandom >"${WORK}/rootfs/etc/payload"
mkfs.erofs -zlz4hc "${IMAGES}/rootfs.erofs" "${WORK}/rootfs" >/dev/null
"${ROOT_DIR}/generate-rauc-keys.sh" "${WORK}/keys" >/dev/null 2>&1

BINARIES_DIR="${IMAGES}" BUILD_DIR="${WORK}/build" HOST_DIR="${WORK}/host" \
  SHOWROOM_IMAGE_VERSION="${VERSION}" \
  SHOWROOM_RAUC_CERT="${WORK}/keys/signing.cert.pem" \
  SHOWROOM_RAUC_KEY="${WORK}/keys/signing.key.pem" \
  SHOWROOM_RAUC_KEYRING="${WORK}/keys/ca.cert.pem" \
  "${ROOT_DIR}/board/rpi5/post-image.sh" >"${WORK}/post-image.log" 2>&1 || {
    cat "${WORK}/post-image.log" >&2
    exit 1
  }

image="${IMAGES}/showroom-os-rpi5-${VERSION}.img"
fail() {
  echo "post-image dry run: $*" >&2
  exit 1
}

layout="$(sfdisk -d "${image}")"
grep -q '^label-id: 0x53484f57$' <<<"${layout}" || fail "wrong disk signature"
for expected in "img1 : start=        2048, size=       32768, type=c, bootable" \
  "img2 : start=       34816, size=      131072, type=c" \
  "img3 : start=      165888, size=      131072, type=c" \
  "img5 : start=      299008, size=     1048576, type=83" \
  "img6 : start=     1349632, size=     1048576, type=83" \
  "img7 : start=     2400256, size=      524288, type=83"; do
  grep -qF "${expected}" <<<"${layout}" || fail "partition table lacks '${expected}'"
done

cmdline="$(mtype -i "${IMAGES}/boot.vfat" ::/cmdline.txt)"
grep -q 'root=PARTUUID=53484f57-05 ' <<<"${cmdline}" || fail "slot A cmdline.txt does not boot partition 5"
grep -q 'rauc.slot=A ' <<<"${cmdline}" || fail "slot A cmdline.txt does not name slot A"
mtype -i "${IMAGES}/boot.vfat" ::/cmdline-B.txt | grep -q 'root=PARTUUID=53484f57-06 rootfstype=erofs ro rootwait rauc.slot=B ' \
  || fail "cmdline-B.txt does not boot partition 6"
config="$(mtype -i "${IMAGES}/boot.vfat" ::/config.txt)"
grep -q '^dtoverlay=vc4-kms-v3d' <<<"${config}" || fail "config.txt is missing from the boot partition"
if [[ -n "${SHOWROOM_OS_CHANNEL_URL:-}" ]]; then
  ! grep -q '^kernel_watchdog_timeout=' <<<"${config}" || fail "development config.txt arms the watchdog"
  grep -q ' console=tty1 ' <<<"${cmdline}" || fail "development cmdline.txt hides boot messages"
else
  grep -q '^kernel_watchdog_timeout=15' <<<"${config}" || fail "config.txt lacks the watchdog"
  grep -q ' quiet ' <<<"${cmdline}" || fail "cmdline.txt is not quiet"
fi
mdir -b -i "${IMAGES}/boot.vfat" ::/overlays | grep -q vc4-kms-v3d-pi5.dtbo || fail "vc4-kms-v3d-pi5 overlay missing"
if mdir -b -i "${IMAGES}/boot.vfat" ::/overlays | grep -q hifiberry; then
  fail "unused overlays were not pruned"
fi
mtype -i "${IMAGES}/autoboot.vfat" ::/autoboot.txt | grep -q '^tryboot_a_b=1' || fail "autoboot.txt lacks tryboot_a_b"

rauc info --keyring="${WORK}/keys/ca.cert.pem" "${IMAGES}/showroom-os-rpi5-${VERSION}.raucb" >"${WORK}/info.txt" 2>&1 \
  || { cat "${WORK}/info.txt" >&2; fail "bundle does not verify against the CA"; }
grep -q "Compatible:.*showroom-rpi5" "${WORK}/info.txt" || fail "bundle has the wrong compatible"
grep -q "Bundle Format:.*verity" "${WORK}/info.txt" || fail "bundle is not a verity bundle"
(cd "${IMAGES}" && sha256sum --quiet -c SHA256SUMS) || fail "SHA256SUMS does not match"

echo "post-image dry run: card layout, boot files and signed bundle are as expected"
