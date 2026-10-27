#!/usr/bin/env python3
"""Smoke-tests a built Showroom OS root filesystem without hardware.

    rootfs-smoke.py out/images/rootfs.erofs
    rootfs-smoke.py showroom-os-rpi5-<version>.img.xz
    rootfs-smoke.py --dir <extracted rootfs>

Catches the mistakes that otherwise only show on a screen: a binary or
library that needs a library the image does not ship, a systemd unit whose
program is missing, a script whose interpreter is missing, a unit that is not
enabled, kernel modules the screen cannot load, and broken links to the
built-in agent and player.
"""

import argparse
import json
import lzma
import os
import shutil
import stat
import subprocess
import sys
import tempfile

ELF_MAGIC = b"\x7fELF"
LIB_DIRS = ["lib", "usr/lib", "lib64", "usr/lib64"]
ELF_DIRS = ["bin", "sbin", "usr/bin", "usr/sbin", "usr/libexec", "usr/local", "usr/lib", "lib", "opt"]
UNIT_DIRS = ["etc/systemd/system", "usr/lib/systemd/system"]
UNIT_PREFIXES = ("showroom-", "NetworkManager", "rauc", "getty@", "systemd-resolved", "wpa_supplicant")

# Loaded with dlopen, so no ELF header names them.
DLOPENED = ["libmpv.so.2"]

REQUIRED_EXECUTABLES = [
    "usr/local/libexec/showroom-agent",
    "opt/showroom/player/bin/showroom-player",
    "usr/lib/showroom/releases/agent/1.0.0/showroom-agent",
    "usr/lib/showroom/releases/player/1.0.0/bin/showroom-player",
]
# Commands the appliance scripts call, looked up on PATH.
REQUIRED_COMMANDS = ["rauc", "jq", "curl", "nmcli", "vcgencmd", "sfdisk", "partx", "systemctl", "sudo", "bash",
                     "tailscale", "tailscaled", "dnsmasq"]
PATH_DIRS = ["usr/local/bin", "usr/bin", "bin", "usr/sbin", "sbin"]
# Built outside Buildroot (Go and Rust), so their glibc symbol versions are
# checked against the image's libraries.
FOREIGN_BINARIES = ["usr/local/libexec/showroom-agent", "opt/showroom/player/bin/showroom-player"]
REQUIRED_FILES = [
    "etc/rauc/system.conf",
    "etc/rauc/keyring.pem",
    "etc/showroom-agent/config.env",
    "usr/lib/os-release",
    "usr/lib/showroom/releases/player/1.0.0/index.html",
    "etc/NetworkManager/dnsmasq-shared.d/showroom-setup.conf",
    # Clock: the boot-time floor, DNSSEC off and the timesync restart on Wi-Fi.
    "usr/lib/clock-epoch",
    "etc/systemd/resolved.conf.d/20-showroom.conf",
    "etc/NetworkManager/dispatcher.d/20-showroom-timesync",
]
ENABLED_UNITS = [
    "NetworkManager.service",
    "showroom-agent.service",
    "showroom-kiosk.service",
    "showroom-update-guard.service",
    "showroom-os-commit.service",
    "showroom-os-follow.timer",
    "showroom-network-onboarding.service",
    "tailscaled.service",
]
DISABLED_UNITS = ["rauc-mark-good.service", "systemd-networkd.service"]
# Drivers built as modules that a screen cannot work without: Wi-Fi, display,
# HEVC decode and HDMI audio.
REQUIRED_MODULES = ["brcmfmac", "cfg80211", "vc4", "rpi-hevc-dec", "snd-soc-hdmi-codec"]


class Rootfs:
    def __init__(self, root):
        self.root = os.path.realpath(root)

    def resolve(self, path, depth=0):
        """Follows symlinks the way the screen would, inside the rootfs."""
        if depth > 40:
            return None
        parts = [p for p in path.strip("/").split("/") if p]
        current = ""
        for index, part in enumerate(parts):
            candidate = f"{current}/{part}"
            host = self.root + candidate
            if os.path.islink(host):
                target = os.readlink(host)
                if target.startswith("/"):
                    base = target
                else:
                    base = os.path.normpath(f"{current}/{target}")
                rest = "/".join(parts[index + 1:])
                return self.resolve(f"{base}/{rest}" if rest else base, depth + 1)
            if part == "..":
                current = os.path.dirname(current)
            else:
                current = candidate
        host = self.root + current
        return host if os.path.lexists(host) else None

    def exists(self, path):
        return self.resolve(path) is not None

    def executable(self, path):
        host = self.resolve(path)
        return host is not None and os.path.isfile(host) and os.stat(host).st_mode & 0o111 != 0


def extract(source, workdir):
    """Returns a directory holding the root filesystem in source."""
    image = source
    if source.endswith(".xz"):
        image = os.path.join(workdir, "image.img")
        with lzma.open(source) as packed, open(image, "wb") as unpacked:
            shutil.copyfileobj(packed, unpacked, 16 << 20)
    erofs = image
    if not source.endswith(".erofs"):
        table = json.loads(subprocess.check_output(["sfdisk", "-J", image]))["partitiontable"]
        part = next(p for p in table["partitions"] if p["node"].endswith("5"))
        erofs = os.path.join(workdir, "rootfs.erofs")
        with open(image, "rb") as disk, open(erofs, "wb") as out:
            disk.seek(part["start"] * 512)
            remaining = part["size"] * 512
            while remaining:
                chunk = disk.read(min(remaining, 16 << 20))
                if not chunk:
                    break
                out.write(chunk)
                remaining -= len(chunk)
    root = os.path.join(workdir, "rootfs")
    subprocess.check_call(["fsck.erofs", f"--extract={root}", "--no-preserve-owner", "--preserve-perms", erofs])
    return root


def is_elf(path):
    try:
        with open(path, "rb") as handle:
            return handle.read(4) == ELF_MAGIC
    except OSError:
        return False


def interpreter(path):
    output = subprocess.run(["readelf", "-lW", path], capture_output=True, text=True).stdout
    for line in output.splitlines():
        if "Requesting program interpreter:" in line:
            return line.split(":", 1)[1].strip().rstrip("]")
    return None


def version_needs(path):
    """Returns {library: {version names}} that path needs."""
    output = subprocess.run(["readelf", "-VW", path], capture_output=True, text=True).stdout
    needs, current, section = {}, None, None
    for line in output.splitlines():
        if line.startswith("Version needs section"):
            section = "needs"
        elif line.startswith("Version"):
            section = None
        elif section == "needs" and "File:" in line:
            current = line.split("File:", 1)[1].split()[0]
            needs.setdefault(current, set())
        elif section == "needs" and "Name:" in line and current:
            needs[current].add(line.split("Name:", 1)[1].split()[0])
    return needs


def version_definitions(path):
    output = subprocess.run(["readelf", "-VW", path], capture_output=True, text=True).stdout
    names, section = set(), None
    for line in output.splitlines():
        if line.startswith("Version definition section"):
            section = "defs"
        elif line.startswith("Version"):
            section = None
        elif section == "defs" and "Name:" in line:
            names.add(line.split("Name:", 1)[1].split()[0])
    return names


def check_foreign(fs, errors):
    for path in FOREIGN_BINARIES:
        host = fs.resolve("/" + path)
        if host is None or not is_elf(host):
            continue
        for lib, versions in version_needs(host).items():
            lib_host = next((h for h in (fs.resolve(f"/{d}/{lib}") for d in LIB_DIRS) if h), None)
            if lib_host is None:
                continue
            missing = sorted(versions - version_definitions(lib_host))
            if missing:
                errors.append(f"/{path} needs {', '.join(missing)} from {lib}, newer than the image provides")


def needed_libraries(path):
    output = subprocess.run(["readelf", "-dW", path], capture_output=True, text=True).stdout
    needed, runpaths = [], []
    for line in output.splitlines():
        if "(NEEDED)" in line:
            needed.append(line.split("[", 1)[1].split("]", 1)[0])
        elif "(RUNPATH)" in line or "(RPATH)" in line:
            runpaths.extend(line.split("[", 1)[1].split("]", 1)[0].split(":"))
    return needed, runpaths


def check_libraries(fs, errors):
    checked = 0
    for top in ELF_DIRS:
        base = os.path.join(fs.root, top)
        if not os.path.isdir(base) or os.path.islink(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            rel_dir = "/" + os.path.relpath(dirpath, fs.root)
            if rel_dir.startswith(("/usr/lib/modules", "/lib/modules", "/lib/firmware", "/usr/lib/firmware")):
                dirnames[:] = []
                continue
            for name in filenames:
                host = os.path.join(dirpath, name)
                if os.path.islink(host) or not os.path.isfile(host) or not is_elf(host):
                    continue
                if name.endswith(".ko") or name.endswith(".o"):
                    continue
                checked += 1
                interp = interpreter(host)
                if interp and not fs.exists(interp):
                    errors.append(f"{rel_dir}/{name} needs the loader {interp}, which the image does not ship")
                needed, runpaths = needed_libraries(host)
                search = list(LIB_DIRS)
                if ".so" in name:
                    # A private library (systemd's libsystemd-core) is loaded by
                    # programs whose RUNPATH names its directory, so its own
                    # dependencies there are found too.
                    search.append(rel_dir.strip("/"))
                for runpath in runpaths:
                    search.append(runpath.replace("$ORIGIN", rel_dir).strip("/"))
                for lib in needed:
                    if not any(fs.exists(f"/{d}/{lib}") for d in search):
                        errors.append(f"{rel_dir}/{name} needs {lib}, which the image does not ship")
    for lib in DLOPENED:
        if not any(fs.exists(f"/{d}/{lib}") for d in LIB_DIRS):
            errors.append(f"{lib} is missing (loaded at runtime)")
    return checked


def unit_files(fs):
    for unit_dir in UNIT_DIRS:
        base = os.path.join(fs.root, unit_dir)
        if not os.path.isdir(base):
            continue
        for dirpath, _, filenames in os.walk(base):
            for name in filenames:
                if name.startswith(UNIT_PREFIXES) or dirpath != base:
                    host = os.path.join(dirpath, name)
                    if not os.path.islink(host) and (name.endswith(".service") or name.endswith(".conf")):
                        yield host


def check_units(fs, errors):
    for host in unit_files(fs):
        rel = os.path.relpath(host, fs.root)
        with open(host, encoding="utf-8", errors="replace") as handle:
            for line in handle:
                key, _, value = line.strip().partition("=")
                if not key.startswith("Exec") or not value.strip():
                    continue
                command = value.strip()
                prefixes = command[:len(command) - len(command.lstrip("@-:+!|"))]
                program = command.lstrip("@-:+!|").split()[0]
                # "-" tolerates failure, including a missing program.
                if "-" in prefixes or "$" in program or "%" in program:
                    continue
                if program.startswith("/") and not fs.executable(program):
                    errors.append(f"{rel}: {key} runs {program}, which is missing or not executable")


def check_scripts(fs, errors):
    # The appliance's own scripts; other packages' helper scripts may name
    # interpreters the image leaves out on purpose (perl, python).
    for top in ["usr/local/bin", "usr/libexec/showroom"]:
        base = os.path.join(fs.root, top)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            host = os.path.join(base, name)
            if os.path.islink(host) or not os.path.isfile(host):
                continue
            with open(host, "rb") as handle:
                first = handle.readline()
            if not first.startswith(b"#!"):
                continue
            words = first[2:].decode(errors="replace").split()
            if not words:
                continue
            interpreter = words[1] if words[0].endswith("/env") and len(words) > 1 else words[0]
            if interpreter.startswith("/"):
                ok = fs.executable(interpreter)
            else:
                ok = any(fs.executable(f"/{d}/{interpreter}") for d in ["usr/bin", "bin", "usr/sbin", "sbin"])
            if not ok:
                errors.append(f"/{top}/{name} needs {interpreter}, which the image does not ship")


def check_enabled(fs, errors):
    if shutil.which("systemctl") is None:
        errors.append("systemctl is not installed on this machine, so unit enablement was not checked")
        return
    for unit in ENABLED_UNITS + DISABLED_UNITS:
        result = subprocess.run(["systemctl", f"--root={fs.root}", "is-enabled", unit], capture_output=True, text=True)
        state = result.stdout.strip() or result.stderr.strip()
        want = unit in ENABLED_UNITS
        if want and state != "enabled":
            errors.append(f"{unit} should be enabled but is '{state}'")
        if not want and state == "enabled":
            errors.append(f"{unit} should not be enabled")


def check_files(fs, errors):
    for path in REQUIRED_EXECUTABLES:
        if not fs.executable("/" + path):
            errors.append(f"/{path} is missing or not executable")
    for command in REQUIRED_COMMANDS:
        if not any(fs.executable(f"/{d}/{command}") for d in PATH_DIRS):
            errors.append(f"{command} is not on the image's PATH")
    for path in REQUIRED_FILES:
        if not fs.exists("/" + path):
            errors.append(f"/{path} is missing")
    config = fs.resolve("/etc/showroom-agent/config.env")
    if config:
        with open(config, encoding="utf-8") as handle:
            text = handle.read()
        for key in ["SHOWROOM_SYSTEM_UPDATE_COMMAND=/usr/libexec/showroom/showroom-os-install",
                    "SHOWROOM_REBOOT_COMMAND=/usr/libexec/showroom/showroom-reboot",
                    "SHOWROOM_SETUP_HOTSPOT=1"]:
            if key not in text.splitlines():
                errors.append(f"config.env lacks {key}")
    # The Pi's hardware watchdog counts at most 15 seconds; a longer timeout
    # wraps to a few seconds and resets the Pi.
    watchdog = fs.resolve("/etc/systemd/system.conf.d/20-showroom-watchdog.conf")
    if watchdog:
        with open(watchdog, encoding="utf-8") as handle:
            if "RuntimeWatchdogSec=15s" not in handle.read().splitlines():
                errors.append("20-showroom-watchdog.conf does not set RuntimeWatchdogSec=15s")
    else:
        errors.append("/etc/systemd/system.conf.d/20-showroom-watchdog.conf is missing")
    channel = fs.resolve("/etc/showroom/os-channel.env")
    os_release = fs.resolve("/usr/lib/os-release")
    if os_release:
        with open(os_release, encoding="utf-8") as handle:
            variant = dict(line.strip().split("=", 1) for line in handle if "=" in line).get("VARIANT_ID")
        if (variant == "dev") != (channel is not None):
            errors.append(f"VARIANT_ID={variant} does not match the OS channel file being {'present' if channel else 'absent'}")


def check_hotspot(fs, errors):
    # NetworkManager runs the first-time setup hotspot through wpa_supplicant,
    # which refuses access-point mode unless it was built with it.
    paths = [f"/{d}/wpa_supplicant" for d in PATH_DIRS]
    binary = next((fs.resolve(p) for p in paths if fs.executable(p)), None)
    if not binary:
        return
    with open(binary, "rb") as handle:
        if b"AP mode support not included in the build" in handle.read():
            errors.append("wpa_supplicant lacks AP mode, so the setup hotspot cannot start; "
                          "set BR2_PACKAGE_WPA_SUPPLICANT_AP_SUPPORT=y")


def check_modules(fs, errors):
    base = fs.resolve("/usr/lib/modules")
    versions = sorted(os.listdir(base)) if base and os.path.isdir(base) else []
    if len(versions) != 1:
        errors.append(f"expected modules for one kernel in /usr/lib/modules, found {versions or 'none'}")
        return
    moddir = os.path.join(base, versions[0])
    if not os.path.isfile(os.path.join(moddir, "modules.dep")):
        errors.append(f"/usr/lib/modules/{versions[0]}/modules.dep is missing")
    found, compressed = {}, []
    for dirpath, _, names in os.walk(moddir):
        for name in names:
            stem, _, suffix = name.partition(".ko")
            if not _:
                continue
            found[stem.replace("_", "-")] = name
            if suffix:
                compressed.append(name)
    # The image's libkmod has no decompressors and the kernel does not
    # decompress modules itself, so a compressed module never loads.
    if compressed:
        errors.append(f"{len(compressed)} kernel modules are compressed (for example {compressed[0]}) and cannot "
                      "be loaded; keep CONFIG_MODULE_COMPRESS off (EROFS compresses them already)")
    for module in REQUIRED_MODULES:
        if module not in found:
            errors.append(f"kernel module {module} is missing")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("source", nargs="?", help="rootfs.erofs, .img or .img.xz")
    parser.add_argument("--dir", help="an already extracted root filesystem")
    args = parser.parse_args()
    if not args.source and not args.dir:
        parser.error("give an image or --dir")

    with tempfile.TemporaryDirectory() as workdir:
        root = args.dir or extract(args.source, workdir)
        fs = Rootfs(root)
        errors = []
        checked = check_libraries(fs, errors)
        check_units(fs, errors)
        check_scripts(fs, errors)
        check_enabled(fs, errors)
        check_files(fs, errors)
        check_foreign(fs, errors)
        check_hotspot(fs, errors)
        check_modules(fs, errors)
        # Extracted files keep their modes; make sure cleanup can remove them.
        for dirpath, dirnames, _ in os.walk(workdir):
            for name in dirnames:
                path = os.path.join(dirpath, name)
                if not os.path.islink(path):
                    os.chmod(path, os.stat(path).st_mode | stat.S_IRWXU)

    for error in errors:
        print(f"FAIL: {error}", file=sys.stderr)
    if errors:
        print(f"rootfs-smoke: {len(errors)} problem(s) in the root filesystem", file=sys.stderr)
        return 1
    print(f"rootfs-smoke: {checked} ELF files, units, scripts, kernel modules and app links look right")
    return 0


if __name__ == "__main__":
    sys.exit(main())
