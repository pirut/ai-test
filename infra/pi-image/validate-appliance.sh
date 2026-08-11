#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:---source}"
TARGET="${2:-}"
MAINTENANCE_USER=showroom-maint

fail() {
  printf 'appliance validation: FAIL: %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'appliance validation: PASS: %s\n' "$*"
}

require_file() {
  [[ -f "$1" ]] || fail "missing required file $1"
}

require_executable() {
  [[ -x "$1" ]] || fail "required executable is missing or not executable: $1"
}

require_contains() {
  local file="$1" pattern="$2" description="$3"
  grep -Eq -- "${pattern}" "${file}" || fail "${description} (${file})"
}

require_not_contains() {
  local file="$1" pattern="$2" description="$3"
  if grep -Eq -- "${pattern}" "${file}"; then
    fail "${description} (${file})"
  fi
}

validate_scripts() {
  local root="$1"
  local scripts=(
    showroom-start-kiosk
    showroom-diagnostics
    showroom-recovery-screen
    showroom-kiosk-recovery
    showroom-kiosk-retry
  )
  local script
  for script in "${scripts[@]}"; do
    require_executable "${root}/usr/local/bin/${script}"
    bash -n "${root}/usr/local/bin/${script}"
  done
  bash "${root}/usr/local/bin/showroom-diagnostics" --self-test >/dev/null
  bash "${root}/usr/local/bin/showroom-recovery-screen" --self-test >/dev/null
}

validate_source() {
  local config="${ROOT_DIR}/rpi-image-gen/config/showroom.yaml"
  local unit="${ROOT_DIR}/systemd/showroom-kiosk.service"
  local getty="${ROOT_DIR}/config/getty-tty1-override.conf"
  local sudoers="${ROOT_DIR}/config/showroom-maintenance.sudoers"
  local ssh="${ROOT_DIR}/config/20-showroom-ssh.conf"
  local prepare="${ROOT_DIR}/prepare-appliance-rootfs.sh"

  require_contains "${config}" '^  user1: pi$' "primary kiosk/Connect user must be explicit"
  require_not_contains "${config}" '^  user1pass(hash)?:' "fleet image must not contain a universal pi password"
  require_not_contains "${config}" '^  user1sudo: none$' "user1sudo=none purges sudo and breaks physical recovery"
  require_contains "${config}" '^  user1sudo: passwd$' "pi must retain sudo without receiving passwordless ALL access"
  require_contains "${config}" '^  user1groups: .*video.*input.*render' "kiosk user is missing display/input groups"
  require_contains "${config}" '^ssh:$' "SSH policy is missing"
  require_contains "${config}" '^  pubkey_only: y$' "SSH password authentication must be disabled"

  require_contains "${getty}" "agetty .*--autologin ${MAINTENANCE_USER}" "tty1 must auto-login the maintenance account"
  require_not_contains "${unit}" '^Conflicts=getty@tty1\.service$' "kiosk must not remove the maintenance console"
  require_contains "${unit}" '^TTYPath=/dev/tty7$' "kiosk must run on tty7"
  require_contains "${unit}" '^Restart=on-failure$' "kiosk restart policy must be failure-only"
  require_contains "${unit}" '^StartLimitBurst=5$' "kiosk restart rate limit is missing"
  require_contains "${unit}" '^OnFailure=showroom-kiosk-recovery\.service$' "kiosk recovery screen hook is missing"
  require_not_contains "${unit}" '^NoNewPrivileges=yes$' "NoNewPrivileges blocks configured Xorg.wrap elevation"
  require_contains "${ROOT_DIR}/config/Xwrapper.config" '^needs_root_rights=yes$' "Xorg privilege contract changed unexpectedly"
  require_contains "${ROOT_DIR}/rpi-image-gen/layer/showroom.yaml" '^[[:space:]]+- xserver-xorg-legacy$' "Xorg.wrap package must be an explicit image dependency"

  require_contains "${ssh}" '^PasswordAuthentication no$' "SSH password authentication must be disabled in the final rootfs"
  require_contains "${ssh}" "^DenyUsers ${MAINTENANCE_USER}$" "maintenance account must be physical-console only"
  require_not_contains "${sudoers}" 'NOPASSWD:[[:space:]]*ALL' "universal passwordless sudo is forbidden"
  require_contains "${sudoers}" "^${MAINTENANCE_USER} .*NOPASSWD: SHOWROOM_" "maintenance account lacks controlled passwordless sudo"

  for source_script in \
    start-kiosk.sh showroom-diagnostics showroom-recovery-screen \
    showroom-kiosk-recovery showroom-kiosk-retry; do
    bash -n "${ROOT_DIR}/systemd/${source_script}"
  done
  bash "${ROOT_DIR}/systemd/showroom-diagnostics" --self-test >/dev/null
  bash "${ROOT_DIR}/systemd/showroom-recovery-screen" --self-test >/dev/null

  for installed in \
    showroom-diagnostics showroom-recovery-screen showroom-kiosk-recovery showroom-kiosk-retry \
    showroom-kiosk-recovery.service showroom-kiosk-retry.service showroom-kiosk-retry.timer; do
    require_contains "${prepare}" "${installed}" "rootfs preparation does not install ${installed}"
  done

  pass "source console, SSH, sudo, kiosk, recovery, and install contracts"
}

validate_rootfs() {
  local root="$1"
  [[ -d "${root}/etc" ]] || fail "${root} is not a mounted/generated root filesystem"

  validate_scripts "${root}"
  require_executable "${root}/usr/local/libexec/showroom-agent"
  require_executable "${root}/usr/lib/xorg/Xorg.wrap"
  local xorg_wrap_mode
  xorg_wrap_mode="$(stat -c '%a' "${root}/usr/lib/xorg/Xorg.wrap")"
  [[ "${xorg_wrap_mode}" == 4* ]] || fail "Xorg.wrap is not setuid in the generated image (mode ${xorg_wrap_mode})"
  [[ "$(stat -c '%u:%g' "${root}/usr/lib/xorg/Xorg.wrap")" == "0:0" ]] || fail "Xorg.wrap must be owned by root"
  require_file "${root}/opt/showroom/player/index.html"
  require_file "${root}/var/lib/showroom/releases/player/1.0.0/index.html"
  [[ -L "${root}/var/lib/showroom/releases/player/current" ]] || fail "active player release symlink is missing"

  local executable
  for executable in \
    usr/bin/startx usr/bin/openbox-session usr/bin/xrandr usr/bin/unclutter \
    usr/bin/curl usr/bin/python3 usr/bin/mpv usr/bin/flock usr/bin/chvt \
    usr/bin/nmcli usr/bin/nmtui usr/bin/systemctl usr/bin/journalctl usr/bin/sudo \
    usr/bin/rpi-connect usr/sbin/runuser usr/sbin/sshd sbin/agetty; do
    require_executable "${root}/${executable}"
  done
  if [[ ! -x "${root}/usr/lib/chromium/chromium" && ! -x "${root}/usr/bin/chromium" && ! -x "${root}/usr/bin/chromium-browser" ]]; then
    fail "Chromium executable is missing"
  fi

  require_contains "${root}/etc/systemd/system/getty@tty1.service.d/override.conf" "--autologin ${MAINTENANCE_USER}" "generated tty1 is not auto-login recovery"
  require_contains "${root}/etc/ssh/sshd_config.d/20-showroom.conf" '^PasswordAuthentication no$' "generated SSH policy permits passwords"
  require_contains "${root}/etc/ssh/sshd_config.d/20-showroom.conf" "^DenyUsers ${MAINTENANCE_USER}$" "generated SSH policy exposes maintenance account"
  require_contains "${root}/etc/systemd/journald.conf.d/20-showroom-limits.conf" '^Storage=persistent$' "persistent journal is not enabled"
  require_contains "${root}/etc/systemd/journald.conf.d/20-showroom-limits.conf" '^SystemMaxUse=256M$' "persistent journal is not bounded"

  local pi_shadow maintenance_shadow getty_exec
  pi_shadow="$(awk -F: '$1 == "pi" { print $2 }' "${root}/etc/shadow")"
  maintenance_shadow="$(awk -F: -v user="${MAINTENANCE_USER}" '$1 == user { print $2 }' "${root}/etc/shadow")"
  [[ -n "${pi_shadow}" ]] || fail "pi account is missing from generated shadow"
  [[ -n "${maintenance_shadow}" ]] || fail "maintenance account is missing from generated shadow"
  getty_exec="$(grep '^ExecStart=' "${root}/etc/systemd/system/getty@tty1.service.d/override.conf" | tail -n 1)"
  if [[ "${pi_shadow}" == '!'* || "${pi_shadow}" == '*'* || "${maintenance_shadow}" == '!'* || "${maintenance_shadow}" == '*'* ]]; then
    [[ "${getty_exec}" == *"--autologin ${MAINTENANCE_USER}"* ]] || fail "a locked console account can be exposed to a tty1 login prompt"
  fi

  grep -q "^${MAINTENANCE_USER}:" "${root}/etc/passwd" || fail "maintenance account is missing"
  local pi_groups maintenance_groups
  pi_groups="$(chroot "${root}" id -nG pi)"
  maintenance_groups="$(chroot "${root}" id -nG "${MAINTENANCE_USER}")"
  for group in video input render audio; do
    [[ " ${pi_groups} " == *" ${group} "* ]] || fail "pi lacks required ${group} device permission"
    [[ " ${maintenance_groups} " == *" ${group} "* ]] || fail "maintenance account lacks required ${group} device permission"
  done
  chroot "${root}" /usr/sbin/runuser -u pi -- /bin/sh -c \
    'test -x /usr/local/bin/showroom-start-kiosk && test -x /usr/lib/xorg/Xorg.wrap && test -r /opt/showroom/player/index.html' || \
    fail "pi cannot execute the kiosk/X wrapper or read built-in player assets"

  local effective_sshd
  effective_sshd="$(chroot "${root}" /usr/sbin/sshd -T -C user=pi,host=localhost,addr=127.0.0.1)"
  grep -Eq '^passwordauthentication no$' <<<"${effective_sshd}" || fail "effective SSH policy enables password authentication"
  grep -Eq '^kbdinteractiveauthentication no$' <<<"${effective_sshd}" || fail "effective SSH policy enables keyboard-interactive authentication"
  grep -Eq '^permitrootlogin no$' <<<"${effective_sshd}" || fail "effective SSH policy permits root login"
  grep -Eq "^denyusers( .*)? ${MAINTENANCE_USER}( |$)|^denyusers ${MAINTENANCE_USER}( |$)" <<<"${effective_sshd}" || \
    fail "effective SSH policy does not deny the physical-console maintenance account"

  local sudo_mode
  sudo_mode="$(stat -c '%a' "${root}/etc/sudoers.d/020-showroom-maintenance")"
  [[ "${sudo_mode}" == "440" ]] || fail "maintenance sudoers mode is ${sudo_mode}, expected 440"
  require_not_contains "${root}/etc/sudoers.d/020-showroom-maintenance" 'NOPASSWD:[[:space:]]*ALL' "generated image grants universal passwordless sudo"
  if command -v visudo >/dev/null 2>&1; then
    visudo -cf "${root}/etc/sudoers.d/020-showroom-maintenance" >/dev/null
  fi

  if command -v systemd-analyze >/dev/null 2>&1; then
    SYSTEMD_LOG_LEVEL=warning systemd-analyze --root="${root}" verify \
      showroom-agent.service showroom-kiosk.service showroom-kiosk-recovery.service \
      showroom-kiosk-retry.service showroom-kiosk-retry.timer getty@tty1.service
    local enabled_unit
    for enabled_unit in showroom-agent.service showroom-kiosk.service showroom-kiosk-retry.timer getty@tty1.service; do
      systemctl --root="${root}" is-enabled --quiet "${enabled_unit}" || fail "${enabled_unit} is not enabled in the generated image"
    done
  fi

  pass "generated rootfs accounts, units, permissions, assets, executables, SSH, journal, and recovery command"
}

validate_persistent_permissions() {
  local root="$1" persistent="$2"
  local pi_uid pi_gid maintenance_uid maintenance_gid
  pi_uid="$(awk -F: '$1 == "pi" { print $3 }' "${root}/etc/passwd")"
  pi_gid="$(awk -F: '$1 == "pi" { print $4 }' "${root}/etc/passwd")"
  maintenance_uid="$(awk -F: -v user="${MAINTENANCE_USER}" '$1 == user { print $3 }' "${root}/etc/passwd")"
  maintenance_gid="$(awk -F: -v user="${MAINTENANCE_USER}" '$1 == user { print $4 }' "${root}/etc/passwd")"

  [[ "$(stat -c '%u:%g' "${persistent}/home/pi")" == "${pi_uid}:${pi_gid}" ]] || \
    fail "persistent pi home is not owned by pi"
  [[ "$(stat -c '%u:%g' "${persistent}/home/${MAINTENANCE_USER}")" == "${maintenance_uid}:${maintenance_gid}" ]] || \
    fail "persistent maintenance home is not owned by ${MAINTENANCE_USER}"
  [[ "$(stat -c '%a' "${persistent}/home/pi")" =~ ^7[057][057]$ ]] || \
    fail "persistent pi home is not writable by the kiosk user"
  [[ "$(stat -c '%a' "${persistent}/home/${MAINTENANCE_USER}")" =~ ^7[057][057]$ ]] || \
    fail "persistent maintenance home is not writable by the maintenance user"

  require_file "${persistent}/shared/var/lib/showroom/releases/player/1.0.0/index.html"
  require_executable "${persistent}/shared/var/lib/showroom/releases/agent/1.0.0/showroom-agent"
  [[ -r "${persistent}/shared/var/lib/showroom/releases/player/1.0.0/index.html" ]] || \
    fail "seeded player assets are not readable"
  pass "persistent homes and slot-shared player/agent permissions"
}

validate_image() {
  local image="$1"
  [[ "${EUID}" -eq 0 ]] || fail "--image validation must run as root"
  require_file "${image}"
  command -v losetup >/dev/null || fail "losetup is required for image inspection"
  command -v lsblk >/dev/null || fail "lsblk is required for image inspection"

  local loop mount_root mount_root_b mount_persistent system_a system_b persistent
  loop="$(losetup --show --find --partscan "${image}")"
  mount_root="$(mktemp -d)"
  mount_root_b="$(mktemp -d)"
  mount_persistent="$(mktemp -d)"
  cleanup_image() {
    mountpoint -q "${mount_root}" && umount "${mount_root}" || true
    mountpoint -q "${mount_root_b}" && umount "${mount_root_b}" || true
    mountpoint -q "${mount_persistent}" && umount "${mount_persistent}" || true
    losetup -d "${loop}" || true
    rmdir "${mount_root}" "${mount_root_b}" "${mount_persistent}" 2>/dev/null || true
  }
  trap cleanup_image EXIT
  udevadm settle || true

  system_a="$(lsblk -nrpo NAME,PARTLABEL "${loop}" | awk '$2 == "system_a" { print $1; exit }')"
  system_b="$(lsblk -nrpo NAME,PARTLABEL "${loop}" | awk '$2 == "system_b" { print $1; exit }')"
  persistent="$(lsblk -nrpo NAME,PARTLABEL "${loop}" | awk '$2 == "persistent" { print $1; exit }')"
  [[ -n "${system_a}" && -n "${system_b}" && -n "${persistent}" ]] || fail "A/B or persistent partitions are missing"

  if command -v fsck.erofs >/dev/null 2>&1; then
    fsck.erofs "${system_a}" >/dev/null
    fsck.erofs "${system_b}" >/dev/null
  fi
  mount -o ro "${system_a}" "${mount_root}"
  mount -o ro "${system_b}" "${mount_root_b}"
  mount -o ro "${persistent}" "${mount_persistent}"

  validate_rootfs "${mount_root}"
  validate_rootfs "${mount_root_b}"

  [[ -d "${mount_persistent}/home/pi" ]] || fail "persistent pi home is missing"
  [[ -d "${mount_persistent}/home/${MAINTENANCE_USER}" ]] || fail "persistent maintenance home is missing"
  [[ -d "${mount_persistent}/log/journal" ]] || fail "persistent journal directory is missing"
  [[ -d "${mount_persistent}/shared/var/lib/showroom" ]] || fail "slot-shared Showroom state is missing"
  validate_persistent_permissions "${mount_root}" "${mount_persistent}"

  pass "raw image A/B slots and persistent data layout"
  trap - EXIT
  cleanup_image
}

case "${MODE}" in
  --source)
    validate_source
    ;;
  --overlay)
    [[ -n "${TARGET}" ]] || fail "--overlay requires a rootfs overlay path"
    validate_scripts "${TARGET}"
    require_executable "${TARGET}/usr/local/libexec/showroom-agent"
    require_file "${TARGET}/opt/showroom/player/index.html"
    pass "prepared rootfs overlay"
    ;;
  --rootfs)
    [[ -n "${TARGET}" ]] || fail "--rootfs requires a rootfs path"
    validate_rootfs "${TARGET}"
    ;;
  --image)
    [[ -n "${TARGET}" ]] || fail "--image requires an image path"
    validate_image "${TARGET}"
    ;;
  *)
    fail "unknown mode ${MODE}"
    ;;
esac
