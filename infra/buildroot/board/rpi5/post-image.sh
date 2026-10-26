#!/bin/bash
# Buildroot post-image script for Showroom OS on the Raspberry Pi 5.
#
# Produces, in ${BINARIES_DIR}:
#   showroom-os-rpi5-<version>.img.xz   flash image for Raspberry Pi Imager
#   showroom-os-rpi5-<version>.raucb    signed A/B update bundle
#   SHA256SUMS
#
# Card layout (MBR, disk signature 53484f57; RAUC and cmdline.txt use the
# partition UUIDs):
#   1  autoboot   FAT   16M   autoboot.txt: which boot slot the firmware uses
#   2  boot-a     FAT   64M   kernel, DTBs, overlays, config.txt, cmdline.txt
#   3  boot-b     FAT   64M   empty until the first OS update
#   4  extended
#   5  rootfs-a   EROFS 512M
#   6  rootfs-b   EROFS 512M  empty until the first OS update
#   7  data       ext4  256M  grown to the end of the card on first boot
#
# The RAUC bundle is signed with SHOWROOM_RAUC_CERT and SHOWROOM_RAUC_KEY.
set -euo pipefail

BOARD_DIR="$(cd "$(dirname "$0")" && pwd)"
VERSION="${SHOWROOM_IMAGE_VERSION:-dev}"
NAME="showroom-os-rpi5-${VERSION}"
DISK_ID=53484f57
GENIMAGE_TMP="${BUILD_DIR}/genimage.tmp"
STAGE="${BINARIES_DIR}/showroom"
CERT="${SHOWROOM_RAUC_CERT:?SHOWROOM_RAUC_CERT must name the bundle signing certificate}"
KEY="${SHOWROOM_RAUC_KEY:?SHOWROOM_RAUC_KEY must name the bundle signing key}"

rm -rf "${STAGE}"
mkdir -p "${STAGE}"

# Boot files. Every boot partition carries the command lines of both slots;
# slot A's is active in the factory image and the RAUC backend selects the
# right one when it installs into a slot.
for slot in A B; do
  root=05
  [[ "${slot}" == B ]] && root=06
  sed -e "s/@ROOT_PARTUUID@/${DISK_ID}-${root}/" -e "s/@SLOT@/${slot}/" \
    "${BOARD_DIR}/cmdline.txt.in" >"${STAGE}/cmdline-${slot}.txt"
  # Development images show boot messages on the screen, so a test screen
  # that fails to start says why.
  if [[ -n "${SHOWROOM_OS_CHANNEL_URL:-}" ]]; then
    sed -i 's/ console=tty3 quiet loglevel=3 / console=tty1 /' "${STAGE}/cmdline-${slot}.txt"
  fi
done
cp "${BOARD_DIR}/autoboot.txt" "${STAGE}/autoboot.txt"

# Only the overlays config.txt uses (the firmware resolves vc4-kms-v3d to the
# Pi 5 variant through overlay_map.dtb).
overlays=()
for overlay in "${BINARIES_DIR}"/rpi-firmware/overlays/vc4-kms-v3d*.dtbo \
  "${BINARIES_DIR}/rpi-firmware/overlays/overlay_map.dtb"; do
  [[ -e "${overlay}" ]] || { echo "post-image: missing ${overlay}" >&2; exit 1; }
  overlays+=("rpi-firmware/overlays/$(basename "${overlay}")")
done

boot_files=("Image" "rpi-firmware/config.txt")
for dtb in "${BINARIES_DIR}"/*.dtb; do
  boot_files+=("$(basename "${dtb}")")
done

genimage_list() {
  local file
  for file in "$@"; do
    printf '\t\t\t"%s",\n' "${file}"
  done
}

cat >"${STAGE}/genimage.cfg" <<EOF
image autoboot.vfat {
	vfat {
		label = "AUTOBOOT"
		files = {
			"showroom/autoboot.txt",
		}
	}
	size = 16M
}

image boot.vfat {
	vfat {
		label = "BOOT"
		files = {
$(genimage_list "${boot_files[@]}")
			"showroom/cmdline-A.txt",
			"showroom/cmdline-B.txt",
			"showroom/overlays",
		}
		file cmdline.txt {
			image = "showroom/cmdline-A.txt"
		}
	}
	size = 64M
}

image data.ext4 {
	ext4 {
		label = "showroom-data"
		use-mke2fs = true
	}
	size = 256M
}

image ${NAME}.img {
	hdimage {
		partition-table-type = "mbr"
		disk-signature = 0x${DISK_ID}
		align = 1M
	}

	partition autoboot {
		partition-type = 0x0C
		bootable = "true"
		image = "autoboot.vfat"
	}

	partition boot-a {
		partition-type = 0x0C
		image = "boot.vfat"
	}

	partition boot-b {
		partition-type = 0x0C
		size = 64M
	}

	partition rootfs-a {
		partition-type = 0x83
		image = "rootfs.erofs"
		size = 512M
	}

	partition rootfs-b {
		partition-type = 0x83
		size = 512M
	}

	partition data {
		partition-type = 0x83
		image = "data.ext4"
	}
}
EOF

mkdir -p "${STAGE}/overlays"
for overlay in "${overlays[@]}"; do
  cp "${BINARIES_DIR}/${overlay}" "${STAGE}/overlays/"
done

rootfs_size="$(stat -c %s "${BINARIES_DIR}/rootfs.erofs")"
if (( rootfs_size > 512 * 1024 * 1024 )); then
  echo "post-image: rootfs.erofs is ${rootfs_size} bytes, larger than its 512M slot" >&2
  exit 1
fi

trap 'rm -rf "${ROOTPATH_TMP}"' EXIT
ROOTPATH_TMP="$(mktemp -d)"
rm -rf "${GENIMAGE_TMP}"
genimage \
  --rootpath "${ROOTPATH_TMP}" \
  --tmppath "${GENIMAGE_TMP}" \
  --inputpath "${BINARIES_DIR}" \
  --outputpath "${BINARIES_DIR}" \
  --config "${STAGE}/genimage.cfg"

# Signed RAUC bundle with the same boot and root images.
bundle_dir="${STAGE}/bundle"
mkdir -p "${bundle_dir}"
cp "${BINARIES_DIR}/boot.vfat" "${bundle_dir}/boot.vfat"
cp "${BINARIES_DIR}/rootfs.erofs" "${bundle_dir}/rootfs.img"
cat >"${bundle_dir}/manifest.raucm" <<EOF
[update]
compatible=showroom-rpi5
version=${VERSION}

[bundle]
format=verity

[image.boot]
filename=boot.vfat

[image.rootfs]
filename=rootfs.img
EOF
rm -f "${BINARIES_DIR}/${NAME}.raucb"
"${HOST_DIR}/bin/rauc" bundle \
  --cert="${CERT}" \
  --key="${KEY}" \
  "${bundle_dir}" \
  "${BINARIES_DIR}/${NAME}.raucb"
"${HOST_DIR}/bin/rauc" info \
  --keyring="${SHOWROOM_RAUC_KEYRING:-${CERT}}" \
  "${BINARIES_DIR}/${NAME}.raucb"

rm -f "${BINARIES_DIR}/${NAME}.img.xz"
xz -T0 -6 --keep "${BINARIES_DIR}/${NAME}.img"
(
  cd "${BINARIES_DIR}"
  sha256sum "${NAME}.img.xz" "${NAME}.raucb" >SHA256SUMS
)

{
  echo "Showroom OS ${VERSION}"
  printf 'rootfs (EROFS):        %8d KiB\n' "$((rootfs_size / 1024))"
  printf 'boot partition:        %8d KiB\n' "$(du -k "${BINARIES_DIR}/boot.vfat" | cut -f1)"
  printf 'flash image (raw):     %8d KiB\n' "$(($(stat -c %s "${BINARIES_DIR}/${NAME}.img") / 1024))"
  printf 'flash image (.img.xz): %8d KiB\n' "$(($(stat -c %s "${BINARIES_DIR}/${NAME}.img.xz") / 1024))"
  printf 'OS update (.raucb):    %8d KiB\n' "$(($(stat -c %s "${BINARIES_DIR}/${NAME}.raucb") / 1024))"
} | tee "${BINARIES_DIR}/IMAGE_SIZES.txt"
