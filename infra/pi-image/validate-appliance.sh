#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODE="${1:---source}"
TARGET="${2:-}"
MAINTENANCE_USER=showroom-maint
IMAGE_VALIDATION_LOOP=""
IMAGE_VALIDATION_IMAGE=""
IMAGE_VALIDATION_DIRS=()

cleanup_image() {
  local directory
  for directory in "${IMAGE_VALIDATION_DIRS[@]}"; do
    if [[ -n "${directory}" && -d "${directory}" && "${directory}" == /tmp/* ]]; then
      find "${directory}" -depth -mindepth 1 -delete 2>/dev/null || true
      rmdir "${directory}" 2>/dev/null || true
    fi
  done
  if [[ -n "${IMAGE_VALIDATION_IMAGE}" ]]; then
    while IFS=: read -r loop_device _; do
      [[ -n "${loop_device}" ]] && losetup -d "${loop_device}" 2>/dev/null || true
    done < <(losetup -j "${IMAGE_VALIDATION_IMAGE}" 2>/dev/null || true)
  fi
  if [[ -n "${IMAGE_VALIDATION_LOOP}" ]]; then
    losetup -d "${IMAGE_VALIDATION_LOOP}" 2>/dev/null || true
  fi
  IMAGE_VALIDATION_LOOP=""
  IMAGE_VALIDATION_IMAGE=""
  IMAGE_VALIDATION_DIRS=()
}

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

validate_slot_shared_generator() {
  local generator="$1"
  require_executable "${generator}"

  local fixture
  fixture="$(mktemp -d)"
  mkdir -p "${fixture}/conf" "${fixture}/out" "${fixture}/bin"
  cat >"${fixture}/conf/network.conf" <<'EOF'
Version=1
Path=/etc/NetworkManager/system-connections
EOF
  cat >"${fixture}/conf/showroom.conf" <<'EOF'
Version=1
Path=/var/lib/showroom
Path=/home/pi/.config/chromium-kiosk
EOF
  cat >"${fixture}/bin/systemd-escape" <<'EOF'
#!/bin/sh
path="${2:-${1}}"
printf '%s' "${path#/}" | tr '/.' '--'
EOF
  chmod 0755 "${fixture}/bin/systemd-escape"

  SHOWROOM_SLOT_SHARED_CONF_DIR="${fixture}/conf" \
    SHOWROOM_SLOT_SHARED_OUT_DIR="${fixture}/out" \
    SYSTEMD_ESCAPE="${fixture}/bin/systemd-escape" \
    "${generator}"

  local path unit
  for path in \
    /etc/NetworkManager/system-connections \
    /var/lib/showroom \
    /home/pi/.config/chromium-kiosk; do
    unit="$("${fixture}/bin/systemd-escape" --path "${path}").mount"
    [[ -f "${fixture}/out/${unit}" ]] || fail "slot-shared generator omitted ${path} mount unit"
    [[ -L "${fixture}/out/local-fs.target.wants/${unit}" ]] || fail "slot-shared generator did not activate ${path} mount unit"
  done

  find "${fixture}" -depth -mindepth 1 -delete
  rmdir "${fixture}"
}

validate_scripts() {
  local root="$1"
  local scripts=(
    showroom-start-kiosk
    showroom-diagnostics
    showroom-recovery-screen
    showroom-kiosk-recovery
    showroom-kiosk-retry
    showroom-network-recovery
    showroom-network-onboarding
    showroom-network-setup
  )
  local script
  for script in "${scripts[@]}"; do
    require_executable "${root}/usr/local/bin/${script}"
    bash -n "${root}/usr/local/bin/${script}"
  done
  bash "${root}/usr/local/bin/showroom-diagnostics" --self-test >/dev/null
  bash "${root}/usr/local/bin/showroom-recovery-screen" --self-test >/dev/null
  env -u SHOWROOM_API_BASE_URL \
    SHOWROOM_CONFIG_FILE="${root}/etc/showroom-agent/config.env" \
    bash "${root}/usr/local/bin/showroom-network-onboarding" --self-test >/dev/null
}

validate_source() {
  local config="${ROOT_DIR}/rpi-image-gen/config/showroom.yaml"
  local unit="${ROOT_DIR}/systemd/showroom-kiosk.service"
  local getty="${ROOT_DIR}/config/getty-tty1-override.conf"
  local sudoers="${ROOT_DIR}/config/showroom-maintenance.sudoers"
  local ssh="${ROOT_DIR}/config/20-showroom-ssh.conf"
  local prepare="${ROOT_DIR}/prepare-appliance-rootfs.sh"
  local build="${ROOT_DIR}/build-appliance-image.sh"
  local customize="${ROOT_DIR}/rpi-image-gen/bdebstrap/customize90-showroom"
  local slot_shared_generator="${ROOT_DIR}/rpi-image-gen/rootfs-overlay/usr/lib/systemd/system-generators/slot-shared-generator"
  local network_recovery="${ROOT_DIR}/systemd/showroom-network-recovery"
  local network_recovery_unit="${ROOT_DIR}/systemd/showroom-network-recovery.service"
  local network_onboarding="${ROOT_DIR}/systemd/showroom-network-onboarding"
  local network_onboarding_unit="${ROOT_DIR}/systemd/showroom-network-onboarding.service"
  local workflow="${ROOT_DIR}/../../.github/workflows/appliance-image.yml"

  require_contains "${config}" '^  user1: pi$' "primary kiosk/Connect user must be explicit"
  require_not_contains "${config}" '^  user1pass(hash)?:' "fleet image must not contain a universal pi password"
  require_not_contains "${config}" '^  user1sudo: none$' "user1sudo=none purges sudo and breaks physical recovery"
  require_contains "${config}" '^  user1sudo: passwd$' "pi must retain sudo without receiving passwordless ALL access"
  require_contains "${config}" '^  user1groups: .*video.*input.*render' "kiosk user is missing display/input groups"
  require_contains "${config}" '^ssh:$' "SSH policy is missing"
  require_contains "${config}" '^  pubkey_only: y$' "SSH password authentication must be disabled"
  require_contains "${config}" '^  default: en_US\.UTF-8$' "first-boot locale must match the deployed US fleet"
  require_contains "${config}" '^  keyboard_keymap: us$' "first-boot Wi-Fi password entry requires a US console keymap"
  require_contains "${config}" '^  keyboard_layout: English \(US\)$' "first-boot keyboard layout must be US English"
  require_contains "${config}" '^  timezone: America/New_York$' "appliance timezone must match fleet operations"

  require_contains "${getty}" "agetty .*--autologin ${MAINTENANCE_USER}" "tty1 must auto-login the maintenance account"
  require_not_contains "${unit}" '^Conflicts=getty@tty1\.service$' "kiosk must not remove the maintenance console"
  require_contains "${unit}" '^TTYPath=/dev/tty7$' "kiosk must run on tty7"
  require_contains "${unit}" '^Restart=on-failure$' "kiosk restart policy must be failure-only"
  require_contains "${unit}" '^StartLimitBurst=5$' "kiosk restart rate limit is missing"
  require_contains "${unit}" '^OnFailure=showroom-kiosk-recovery\.service$' "kiosk recovery screen hook is missing"
  require_contains "${unit}" '^ExecStartPost=\+/usr/bin/chvt 7$' "a healthy kiosk must switch the physical display from tty1 to tty7"
  require_contains "${unit}" '^Type=notify$' "kiosk must report X11 readiness before tty7 is activated"
  require_contains "${unit}" '^NotifyAccess=all$' "kiosk readiness notifications from the launcher must be accepted"
  require_contains "${ROOT_DIR}/systemd/start-kiosk.sh" '^systemd-notify --ready --pid="\$\$"$' "kiosk launcher must report readiness only after X11 starts"
  require_contains "${unit}" '^ReadWritePaths=.* /var/log( |$)' "Xorg must be able to create its root-owned log inside the kiosk sandbox"
  require_not_contains "${unit}" '^NoNewPrivileges=yes$' "NoNewPrivileges blocks configured Xorg.wrap elevation"
  require_contains "${ROOT_DIR}/config/Xwrapper.config" '^needs_root_rights=yes$' "Xorg privilege contract changed unexpectedly"
  require_contains "${ROOT_DIR}/rpi-image-gen/layer/showroom.yaml" '^[[:space:]]+- xserver-xorg-legacy$' "Xorg.wrap package must be an explicit image dependency"
  require_contains "${ROOT_DIR}/rpi-image-gen/layer/showroom.yaml" '^[[:space:]]+- unclutter$' "cursor-hiding package must be an explicit image dependency"
  require_contains "${ROOT_DIR}/systemd/start-kiosk.sh" '^unclutter-classic -idle 0\.1 -root &$' "kiosk must invoke Debian's installed unclutter binary"
  require_not_contains "${ROOT_DIR}/rpi-image-gen/layer/showroom.yaml" '^[[:space:]]*customize-hooks:' "YAML customize-hooks run before source overlays and cannot configure Showroom files"
  require_executable "${customize}"
  bash -n "${customize}"
  require_contains "${customize}" 'enable-units.*root' "post-overlay customize hook must enable appliance units"
  require_contains "${customize}" 'systemctl enable getty@tty1\.service' "post-overlay customize hook must explicitly enable tty1 auto-login"
  require_contains "${customize}" 'visudo -cf' "post-overlay customize hook must validate maintenance sudoers"
  require_contains "${customize}" 'install -d -o pi -g pi .*/persistent/shared/home/pi/\.config/chromium-kiosk' "post-overlay hook must seed the persistent Chromium profile with pi ownership"
  require_contains "${customize}" 'install -d -o root -g root .*/persistent/shared/etc/NetworkManager/system-connections' "post-overlay hook must seed the persistent NetworkManager profile store"
  require_contains "${ROOT_DIR}/rpi-image-gen/layer/trixie-showroom-base.yaml" 'systemd-resolved,?$' "image must install and enable the resolver used by its stub resolv.conf"
  require_contains "${ROOT_DIR}/rpi-image-gen/layer/trixie-showroom-base.yaml" '^[# ]+network-manager,?$' "base image must use NetworkManager's wpa_supplicant backend"
  require_not_contains "${ROOT_DIR}/rpi-image-gen/layer/trixie-showroom-base.yaml" 'network-manager-iwd' "iwd is incompatible with the Pi 5 BCM43455 WPA3 external-authentication path"
  require_contains "${ROOT_DIR}/rpi-image-gen/layer/showroom.yaml" '^[[:space:]]+- wpasupplicant$' "wpa_supplicant must be an explicit image dependency"
  validate_slot_shared_generator "${slot_shared_generator}"
  require_not_contains "${network_recovery}" '^[[:space:]]*\.[[:space:]]+/etc/showroom-agent/config\.env' "network recovery must not source a systemd EnvironmentFile as shell code"
  require_contains "${network_recovery_unit}" '^EnvironmentFile=/etc/showroom-agent/config\.env$' "network recovery must receive configuration through systemd"
  require_contains "${network_onboarding_unit}" '^Before=getty@tty1\.service showroom-agent\.service showroom-kiosk\.service showroom-network-recovery\.service$' "first-boot network setup must gate the console and appliance services"
  require_contains "${network_onboarding_unit}" '^ConditionPathExists=!/var/lib/showroom/state/network-onboarding-complete$' "network setup completion must persist across A/B boots"
  require_contains "${network_onboarding_unit}" '^TTYPath=/dev/tty1$' "first-boot network setup must own the physical console"
  require_contains "${network_onboarding_unit}" '^TimeoutStartSec=infinity$' "first-boot network setup must wait for technician input without timing out"
  require_contains "${network_onboarding}" '^ *nmtui connect \|\| true$' "first-boot setup must provide an interactive SSID and password selector"
  require_contains "${network_onboarding}" 'curl -fsS .*SHOWROOM_API_BASE_URL' "first-boot setup must verify the real control plane before continuing"
  require_not_contains "${network_onboarding}" '(^|[[:space:]])(source|\.)[[:space:]]+.*config\.env' "physical network setup must not execute its systemd EnvironmentFile as shell code"
  local resolved_api_url
  resolved_api_url="$(env -u SHOWROOM_API_BASE_URL \
    SHOWROOM_CONFIG_FILE="${ROOT_DIR}/config/config.env" \
    bash "${network_onboarding}" --self-test)"
  [[ "${resolved_api_url}" == *'https://screen.jrbussard.com'* ]] || fail "physical network setup cannot read the API URL without systemd"
  require_contains "${network_onboarding}" 'systemctl restart showroom-agent\.service showroom-kiosk\.service' "manual network setup must resume enrollment and playback"
  require_contains "${ROOT_DIR}/systemd/showroom-agent.service" '^Requires=showroom-network-onboarding\.service$' "agent must wait for first-boot networking"
  require_contains "${ROOT_DIR}/systemd/showroom-kiosk.service" '^Requires=showroom-network-onboarding\.service$' "kiosk must wait for first-boot networking"
  require_contains "${ROOT_DIR}/config/20-showroom-kernel-console.conf" '^kernel\.printk = 1 4 1 3$' "kernel messages must not corrupt the appliance setup screen"
  require_contains "${ROOT_DIR}/systemd/showroom-diagnostics" '/var/log/Xorg\.0\.log' "diagnostics must inspect root-owned Xorg wrapper logs"
  require_contains "${ROOT_DIR}/systemd/showroom-diagnostics" "grep -Ei 'xorg\|startx\|xf86\|tty7\|vt7" "diagnostics must retain Xorg and virtual-console journal failures"
  require_not_contains "${workflow}" '^[[:space:]]+push:$' "appliance image builds must be local/manual, not automatic GitHub push builds"
  require_not_contains "${BASH_SOURCE[0]}" '^[[:space:]]*mount -o ro' "Pi 5 16 KiB filesystems must not depend on a 4 KiB host kernel mount"
  require_contains "${BASH_SOURCE[0]}" 'erofs_fsck.*--extract=' "image validator must inspect EROFS in userspace"
  require_contains "${BASH_SOURCE[0]}" 'debugfs -R.*rdump' "image validator must inspect persistent ext4 in userspace"
  require_contains "${build}" 'SHOWROOM_FSCK_EROFS=' "image build must pass its 16 KiB-capable EROFS checker to validation"
  require_contains "${build}" "-maxdepth 1 -type d -name '\*-linux-gnu'" "EROFS checker discovery must stay inside the generated toolchain"

  require_contains "${ssh}" '^PasswordAuthentication no$' "SSH password authentication must be disabled in the final rootfs"
  require_contains "${ssh}" "^DenyUsers ${MAINTENANCE_USER}$" "maintenance account must be physical-console only"
  require_not_contains "${sudoers}" 'NOPASSWD:[[:space:]]*ALL' "universal passwordless sudo is forbidden"
  require_contains "${sudoers}" "^${MAINTENANCE_USER} .*NOPASSWD: SHOWROOM_" "maintenance account lacks controlled passwordless sudo"
  require_contains "${sudoers}" '/usr/local/bin/showroom-network-setup' "maintenance account cannot safely reopen network setup"

  for source_script in \
    start-kiosk.sh showroom-diagnostics showroom-recovery-screen \
    showroom-kiosk-recovery showroom-kiosk-retry showroom-network-recovery showroom-network-onboarding; do
    bash -n "${ROOT_DIR}/systemd/${source_script}"
  done
  bash "${ROOT_DIR}/systemd/showroom-diagnostics" --self-test >/dev/null
  bash "${ROOT_DIR}/systemd/showroom-recovery-screen" --self-test >/dev/null
  env -u SHOWROOM_API_BASE_URL \
    SHOWROOM_CONFIG_FILE="${ROOT_DIR}/config/config.env" \
    bash "${ROOT_DIR}/systemd/showroom-network-onboarding" --self-test >/dev/null

  for installed in \
    showroom-diagnostics showroom-recovery-screen showroom-kiosk-recovery showroom-kiosk-retry \
    showroom-network-onboarding showroom-network-setup showroom-kiosk-recovery.service \
    showroom-kiosk-retry.service showroom-kiosk-retry.timer showroom-network-onboarding.service; do
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
  validate_slot_shared_generator "${root}/usr/lib/systemd/system-generators/slot-shared-generator"
  require_file "${root}/etc/rpi-image-gen/slot-shared.d/network-manager.conf"
  require_file "${root}/etc/rpi-image-gen/slot-shared.d/showroom.conf"
  local xorg_wrap_mode
  xorg_wrap_mode="$(stat -c '%a' "${root}/usr/lib/xorg/Xorg.wrap")"
  (( (8#${xorg_wrap_mode} & 04000) != 0 )) || fail "Xorg.wrap is not setuid in the generated image (mode ${xorg_wrap_mode})"
  [[ "$(stat -c '%u:%g' "${root}/usr/lib/xorg/Xorg.wrap")" == "0:0" ]] || fail "Xorg.wrap must be owned by root"
  require_file "${root}/opt/showroom/player/index.html"
  require_file "${root}/var/lib/showroom/releases/player/1.0.0/index.html"
  [[ -L "${root}/var/lib/showroom/releases/player/current" ]] || fail "active player release symlink is missing"

  local executable
  for executable in \
    usr/bin/startx usr/bin/openbox-session usr/bin/xrandr usr/bin/unclutter-classic \
    usr/bin/curl usr/bin/python3 usr/bin/mpv usr/bin/flock usr/bin/chvt usr/bin/nm-online usr/bin/pgrep \
    usr/bin/nmcli usr/bin/nmtui usr/bin/systemctl usr/bin/systemd-analyze usr/bin/systemd-notify usr/bin/journalctl usr/bin/sudo \
    usr/bin/rpi-connect usr/sbin/ip usr/sbin/runuser usr/sbin/sshd usr/sbin/wpa_supplicant sbin/agetty; do
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
  require_contains "${root}/etc/sysctl.d/20-showroom-kernel-console.conf" '^kernel\.printk = 1 4 1 3$' "kernel console messages can corrupt setup and recovery screens"
  [[ -L "${root}/etc/resolv.conf" ]] || fail "generated resolv.conf is not managed by systemd-resolved"
  [[ "$(readlink "${root}/etc/resolv.conf")" == */run/systemd/resolve/*resolv.conf ]] || fail "generated resolv.conf does not target systemd-resolved"
  [[ ! -e "${root}/etc/NetworkManager/conf.d/iwd.conf" ]] || fail "generated image still selects NetworkManager's incompatible iwd backend"
  require_contains "${root}/etc/default/keyboard" '^XKBLAYOUT="us"$' "generated console keyboard is not US layout"
  [[ "$(readlink "${root}/etc/localtime")" == "/usr/share/zoneinfo/America/New_York" ]] || fail "generated timezone is not America/New_York"

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

  # sshd expects its boot-created privilege-separation directory even for
  # configuration-only validation. The extracted image intentionally has an
  # empty /run, so create this ephemeral runtime path in the temporary root.
  install -d -m 0755 "${root}/run/sshd"
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

  if [[ -x "${root}/usr/bin/systemd-analyze" ]]; then
    SYSTEMD_LOG_LEVEL=warning chroot "${root}" /usr/bin/systemd-analyze verify \
      showroom-agent.service showroom-kiosk.service showroom-kiosk-recovery.service \
      showroom-kiosk-retry.service showroom-kiosk-retry.timer showroom-network-recovery.service \
      showroom-network-onboarding.service || \
      fail "Showroom systemd units are invalid under the image's systemd version"
    local enabled_unit
    for enabled_unit in NetworkManager.service systemd-resolved.service showroom-network-onboarding.service showroom-agent.service showroom-kiosk.service showroom-kiosk-retry.timer getty@tty1.service; do
      chroot "${root}" /usr/bin/systemctl is-enabled --quiet "${enabled_unit}" || fail "${enabled_unit} is not enabled in the generated image"
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

  local chromium_profile="${persistent}/shared/home/pi/.config/chromium-kiosk"
  [[ -d "${chromium_profile}" ]] || fail "slot-shared Chromium profile is missing"
  [[ "$(stat -c '%u:%g' "${chromium_profile}")" == "${pi_uid}:${pi_gid}" ]] || \
    fail "slot-shared Chromium profile is not owned by pi"
  [[ "$(stat -c '%a' "${chromium_profile}")" =~ ^7[057][057]$ ]] || \
    fail "slot-shared Chromium profile is not writable by pi"

  local nm_profiles="${persistent}/shared/etc/NetworkManager/system-connections"
  [[ -d "${nm_profiles}" ]] || fail "persistent NetworkManager profile store is missing"
  [[ "$(stat -c '%u:%g' "${nm_profiles}")" == "0:0" ]] || fail "NetworkManager profile store must be root-owned"
  local nm_mode
  nm_mode="$(stat -c '%a' "${nm_profiles}")"
  (( (8#${nm_mode} & 0200) != 0 )) || fail "NetworkManager profile store is not writable by NetworkManager"

  require_file "${persistent}/shared/var/lib/showroom/releases/player/1.0.0/index.html"
  require_executable "${persistent}/shared/var/lib/showroom/releases/agent/1.0.0/showroom-agent"
  [[ -r "${persistent}/shared/var/lib/showroom/releases/player/1.0.0/index.html" ]] || \
    fail "seeded player assets are not readable"
  pass "persistent homes and slot-shared player/agent permissions"
}

partition_device_by_label() {
  local image="$1" loop="$2" label="$3" device partition_number start size

  device="$(lsblk -nrpo NAME,PARTLABEL "${loop}" | awk -v label="${label}" '$2 == label { print $1; exit }')"
  if [[ -n "${device}" ]]; then
    printf '%s\n' "${device}"
    return 0
  fi

  # Nested privileged builders can expose loop partitions before udev has
  # populated PARTLABEL. Read the GPT directly rather than weakening the check.
  read -r partition_number start size < <(sfdisk --json "${image}" | python3 -c '
import json
import sys

label = sys.argv[1]
partitions = json.load(sys.stdin)["partitiontable"]["partitions"]
for number, partition in enumerate(partitions, start=1):
    if partition.get("name") == label:
        print(number, partition["start"], partition["size"])
        break
' "${label}")
  [[ "${partition_number}" =~ ^[0-9]+$ && "${start}" =~ ^[0-9]+$ && "${size}" =~ ^[0-9]+$ ]] || return 1

  if [[ "${loop}" =~ [0-9]$ ]]; then
    device="${loop}p${partition_number}"
  else
    device="${loop}${partition_number}"
  fi
  if [[ ! -b "${device}" ]]; then
    device="$(losetup --show --find --offset "$((start * 512))" --sizelimit "$((size * 512))" "${image}")"
  fi
  [[ -b "${device}" ]] || return 1
  printf '%s\n' "${device}"
}

validate_image() {
  local image="$1"
  local erofs_fsck="${SHOWROOM_FSCK_EROFS:-}"
  [[ "${EUID}" -eq 0 ]] || fail "--image validation must run as root"
  require_file "${image}"
  command -v losetup >/dev/null || fail "losetup is required for image inspection"
  command -v lsblk >/dev/null || fail "lsblk is required for image inspection"
  command -v sfdisk >/dev/null || fail "sfdisk is required for GPT inspection"
  command -v python3 >/dev/null || fail "python3 is required for GPT inspection"
  if [[ -z "${erofs_fsck}" ]]; then
    erofs_fsck="$(command -v fsck.erofs || true)"
  fi
  [[ -x "${erofs_fsck}" ]] || fail "a 16 KiB-capable fsck.erofs is required for userspace EROFS inspection"
  command -v e2fsck >/dev/null || fail "e2fsck is required for persistent filesystem inspection"
  command -v debugfs >/dev/null || fail "debugfs is required for userspace persistent filesystem extraction"

  local root_a root_b persistent_root system_a system_b persistent
  IMAGE_VALIDATION_IMAGE="${image}"
  IMAGE_VALIDATION_LOOP="$(losetup --show --find --partscan "${image}")"
  root_a="$(mktemp -d)"
  root_b="$(mktemp -d)"
  persistent_root="$(mktemp -d)"
  IMAGE_VALIDATION_DIRS=("${root_a}" "${root_b}" "${persistent_root}")
  trap cleanup_image EXIT
  udevadm settle || true

  system_a="$(partition_device_by_label "${image}" "${IMAGE_VALIDATION_LOOP}" system_a || true)"
  system_b="$(partition_device_by_label "${image}" "${IMAGE_VALIDATION_LOOP}" system_b || true)"
  persistent="$(partition_device_by_label "${image}" "${IMAGE_VALIDATION_LOOP}" persistent || true)"
  [[ -n "${system_a}" && -n "${system_b}" && -n "${persistent}" ]] || fail "A/B or persistent partitions are missing"

  # Pi 5 images use 16 KiB filesystem blocks. GitHub's ARM runner can have a
  # 4 KiB-page host kernel that cannot mount them, so inspect and extract both
  # filesystems with userspace tools instead of weakening the Pi layout.
  "${erofs_fsck}" --extract="${root_a}" --preserve "${system_a}" >/dev/null
  "${erofs_fsck}" --extract="${root_b}" --preserve "${system_b}" >/dev/null
  e2fsck -fn "${persistent}" >/dev/null
  debugfs -R "rdump / ${persistent_root}" "${persistent}" >/dev/null

  validate_rootfs "${root_a}"
  validate_rootfs "${root_b}"

  [[ -d "${persistent_root}/home/pi" ]] || fail "persistent pi home is missing"
  [[ -d "${persistent_root}/home/${MAINTENANCE_USER}" ]] || fail "persistent maintenance home is missing"
  [[ -d "${persistent_root}/log/journal" ]] || fail "persistent journal directory is missing"
  [[ -d "${persistent_root}/shared/var/lib/showroom" ]] || fail "slot-shared Showroom state is missing"
  validate_persistent_permissions "${root_a}" "${persistent_root}"

  pass "raw image A/B slots and persistent data layout via userspace extraction"
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
    validate_slot_shared_generator "${TARGET}/usr/lib/systemd/system-generators/slot-shared-generator"
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
