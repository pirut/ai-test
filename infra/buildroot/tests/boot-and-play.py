#!/usr/bin/env python3
"""Boots a Showroom OS flash image in QEMU and checks that it ends up playing.

    boot-and-play.py out/images/showroom-os-rpi5-<version>.img.xz

The image is booted exactly as built, from an emulated SD card, next to a
stand-in for the dashboard that pairs the screen and gives it a two-clip
playlist. The run passes only if, without anyone touching it:

  1. the first power on grows the data partition and restarts once, and only
     once (a restart loop fails here);
  2. the screen registers, shows a pairing code, is paired, downloads the
     playlist and plays it, and the on-device self-test
     (/usr/libexec/showroom/showroom-selftest) passes: no failed units, no
     service restarts, no player crash, data partition mounted, playback
     position moving;
  3. the emulated display shows a picture and a dashboard screenshot request
     is answered;
  4. after a restart ordered from the dashboard the screen comes back, still
     paired, plays again and the self-test passes again;
  5. it then stays up, with no further restart.

What QEMU cannot show is anything specific to the Pi: the VideoCore display
and GPU path (the player draws through plain KMS here, vo=drm), hardware HEVC
decoding, HDMI audio, Wi-Fi, the firmware's A/B slot switch, the hardware
watchdog and the power supply. pi-check.sh covers those on a real screen.

The Raspberry Pi kernel does not run on QEMU's generic "virt" machine, so the
image's root filesystem and partitions are booted with Ubuntu's arm64 kernel
(downloaded once, pinned by checksum). The image is not modified. A small
initramfs mounts the image's root and, through /run only, points the agent at
the stand-in dashboard and starts the self-test.

Needs: qemu-system-aarch64, fsck.erofs (erofs-utils), mtools, sfdisk, zstd,
dpkg-deb, xz. About 15 minutes without hardware acceleration.
"""

import argparse
import email.parser
import email.policy
import hashlib
import http.server
import json
import lzma
import os
import re
import shlex
import shutil
import socket
import stat
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SELFTEST = os.path.join(HERE, "..", "board", "rpi5", "rootfs-overlay", "usr", "libexec", "showroom", "showroom-selftest")
MEDIA_DIR = os.path.join(HERE, "media")

# Ubuntu 24.04's release kernel for arm64. The release pocket never changes,
# so these files and checksums stay valid.
KERNEL_VERSION = "6.8.0-31-generic"
KERNEL_BASE = "http://ports.ubuntu.com/ubuntu-ports/pool/main/l/linux/"
KERNEL_PACKAGES = {
    "linux-image-unsigned-6.8.0-31-generic_6.8.0-31.31_arm64.deb": "370c09d374978f7bd6b157adc8dfae9b4498d9a4ae24aa8068000f0c61a0273e",
    "linux-modules-6.8.0-31-generic_6.8.0-31.31_arm64.deb": "9586c56b4c20b61edad5c9d871ef9f83cd1a8575f2d31a589b7f110e60fe1016",
    "linux-modules-extra-6.8.0-31-generic_6.8.0-31.31_arm64.deb": "04601818b8faa2d3a2e1797866d739fa3f1dbdde937e41fdbc3f3f91f6ce9f46",
}
# Not built into that kernel: the root filesystem, the SD card controller,
# the display, the FAT character set of the AUTOBOOT partition, what systemd
# and Tailscale expect to find, and a simulated Wi-Fi radio, so the screen
# has a wlan0 as a Pi does (with no networks in range).
MODULES = ["erofs", "sdhci-pci", "virtio-gpu", "nls_iso8859-1", "autofs4", "tun", "mac80211_hwsim"]

# The address the guest reaches the stand-in dashboard at. QEMU forwards it to
# the harness; the guest has no other network.
CLOUD_GUEST_URL = "http://10.0.2.100"
CARD_BYTES = 4 << 30  # QEMU's SD card wants a power of two

BOOT_MARKER = "SHOWROOM-TEST: boot"
RESULT_MARKER = "SHOWROOM-SELFTEST: "

INIT = r"""#!/bin/busybox sh
# Boot test initramfs: loads the modules Ubuntu's kernel keeps out of the
# kernel image, mounts the Showroom OS root as it is and hands over to its
# systemd. Everything the test adds lives under /run.
/bin/busybox mkdir -p /proc /sys /dev /newroot
/bin/busybox --install -s /bin
mount -t proc proc /proc
mount -t sysfs sysfs /sys
mount -t devtmpfs devtmpfs /dev
echo "@BOOT_MARKER@" >/dev/console
while read -r module; do
  insmod "/modules/${module}" || echo "SHOWROOM-TEST: could not load ${module}" >/dev/console
done </modules/order
root="$(sed -n 's/.*showroomtest\.root=\([^ ]*\).*/\1/p' /proc/cmdline)"
tries=0
while [ ! -b "${root}" ]; do
  tries=$((tries + 1))
  if [ "${tries}" -gt 300 ]; then
    echo "SHOWROOM-TEST: root device ${root} never appeared" >/dev/console
    exec sh
  fi
  sleep 0.2
done
mount -t erofs -o ro "${root}" /newroot || { echo "SHOWROOM-TEST: cannot mount ${root}" >/dev/console; exec sh; }
mount -t tmpfs -o mode=755,nosuid,nodev,size=20% tmpfs /newroot/run
mkdir -p /newroot/run/showroom-test /newroot/run/systemd/system
cp /fixture/showroom-selftest /newroot/run/showroom-test/showroom-selftest
cp /fixture/showroom-test-selftest.service /newroot/run/systemd/system/
# The agent's configuration with the stand-in dashboard's address, bound over
# the file on the read-only root.
sed 's|^SHOWROOM_API_BASE_URL=.*|SHOWROOM_API_BASE_URL=@CLOUD@|' \
  /newroot/etc/showroom-agent/config.env >/newroot/run/showroom-test/config.env
mount -o bind /newroot/run/showroom-test/config.env /newroot/etc/showroom-agent/config.env
mount --move /proc /newroot/proc
mount --move /sys /newroot/sys
mount --move /dev /newroot/dev
exec switch_root /newroot /sbin/init
"""

SELFTEST_UNIT = """[Unit]
Description=Boot test: on-device self-test
After=showroom-agent.service showroom-kiosk.service

[Service]
Type=exec
ExecStart=/bin/bash /run/showroom-test/showroom-selftest --expect playing --wait 900 --logs
StandardOutput=journal+console
StandardError=journal+console
"""


class Failure(Exception):
    pass


def log(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def need(*tools):
    missing = [tool for tool in tools if not shutil.which(tool)]
    if missing:
        raise Failure("missing tools: " + ", ".join(missing))


# --- Kernel and initramfs -------------------------------------------------


def fetch_kernel(cache):
    """Returns (vmlinuz, modules directory), downloading and unpacking once."""
    tree = os.path.join(cache, f"linux-{KERNEL_VERSION}")
    vmlinuz = os.path.join(tree, "boot", f"vmlinuz-{KERNEL_VERSION}")
    modules = os.path.join(tree, "lib", "modules", KERNEL_VERSION)
    if os.path.exists(os.path.join(tree, ".complete")):
        return vmlinuz, modules
    os.makedirs(cache, exist_ok=True)
    shutil.rmtree(tree, ignore_errors=True)
    for name, sha256 in KERNEL_PACKAGES.items():
        package = os.path.join(cache, name)
        if not os.path.exists(package) or file_sha256(package) != sha256:
            log(f"downloading {name}")
            with urllib.request.urlopen(KERNEL_BASE + name, timeout=120) as response, open(package + ".part", "wb") as out:
                shutil.copyfileobj(response, out)
            if file_sha256(package + ".part") != sha256:
                raise Failure(f"{name} does not match its pinned checksum")
            os.replace(package + ".part", package)
        subprocess.check_call(["dpkg-deb", "-x", package, tree])
        os.remove(package)
    if not os.path.exists(modules):
        # Newer packages install under /usr/lib.
        modules = os.path.join(tree, "usr", "lib", "modules", KERNEL_VERSION)
    open(os.path.join(tree, ".complete"), "w").close()
    return vmlinuz, modules


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def module_key(name):
    return name.replace("-", "_")


def resolve_modules(modules_dir, wanted):
    """The wanted modules and what they depend on, as (name, bytes), in load
    order. Anything listed in modules.builtin is already in the kernel."""
    index = {}
    for folder, _, files in os.walk(modules_dir):
        for name in files:
            if ".ko" in name:
                index[module_key(name.split(".ko")[0])] = os.path.join(folder, name)
    builtin = set()
    with open(os.path.join(modules_dir, "modules.builtin")) as source:
        for line in source:
            builtin.add(module_key(os.path.basename(line.strip()).split(".ko")[0]))
    ordered = []
    seen = set()

    def add(name, required):
        key = module_key(name)
        if key in seen or key in builtin:
            return
        seen.add(key)
        path = index.get(key)
        if path is None:
            if required:
                raise Failure(f"kernel module {name} is not in the {KERNEL_VERSION} packages")
            return
        if path.endswith(".zst"):
            data = subprocess.check_output(["zstd", "-dc", path])
        else:
            with open(path, "rb") as source:
                data = source.read()
        match = re.search(rb"\x00depends=([^\x00]*)\x00", data)
        for dependency in (match.group(1).decode() if match else "").split(","):
            if dependency:
                add(dependency, False)
        ordered.append((key + ".ko", data))

    for name in wanted:
        add(name, True)
    return ordered


class Cpio:
    """Writes a newc cpio archive, so no root or cpio binary is needed."""

    def __init__(self):
        self.parts = []
        self.inode = 0

    def add(self, name, mode, data=b"", rdev=(0, 0)):
        self.inode += 1
        encoded = name.encode() + b"\0"
        header = "070701" + "".join(
            f"{value:08X}"
            for value in (self.inode, mode, 0, 0, 1, 0, len(data), 0, 0, rdev[0], rdev[1], len(encoded), 0)
        )
        entry = header.encode() + encoded
        entry += b"\0" * (-len(entry) % 4)
        entry += data + b"\0" * (-len(data) % 4)
        self.parts.append(entry)

    def directory(self, name):
        self.add(name, stat.S_IFDIR | 0o755)

    def file(self, name, data, mode=0o644):
        self.add(name, stat.S_IFREG | mode, data)

    def finish(self):
        self.add("TRAILER!!!", 0)
        return b"".join(self.parts)


def build_initramfs(rootfs, modules_dir, destination):
    archive = Cpio()
    for folder in ("bin", "dev", "lib", "modules", "fixture"):
        archive.directory(folder)
    archive.add("dev/console", stat.S_IFCHR | 0o600, rdev=(5, 1))
    # As in the image, where the loader looks for libraries in /lib64 too.
    archive.add("lib64", stat.S_IFLNK | 0o777, b"lib")
    archive.add("usr", stat.S_IFLNK | 0o777, b".")
    # The image's own busybox and the libraries it is linked against.
    with open(os.path.join(rootfs, "bin", "busybox"), "rb") as source:
        archive.file("bin/busybox", source.read(), 0o755)
    for library in ("ld-linux-aarch64.so.1", "libc.so.6", "libresolv.so.2", "libm.so.6"):
        path = os.path.realpath(os.path.join(rootfs, "usr", "lib", library))
        if os.path.isfile(path):
            with open(path, "rb") as source:
                archive.file(f"lib/{library}", source.read(), 0o755)
    modules = resolve_modules(modules_dir, MODULES)
    for name, data in modules:
        archive.file(f"modules/{name}", data)
    archive.file("modules/order", "".join(f"{name}\n" for name, _ in modules).encode())
    with open(SELFTEST, "rb") as source:
        archive.file("fixture/showroom-selftest", source.read(), 0o755)
    archive.file("fixture/showroom-test-selftest.service", SELFTEST_UNIT.encode())
    init = INIT.replace("@BOOT_MARKER@", BOOT_MARKER).replace("@CLOUD@", CLOUD_GUEST_URL)
    archive.file("init", init.encode(), 0o755)
    with open(destination, "wb") as out:
        out.write(archive.finish())


# --- The image ------------------------------------------------------------


def prepare_card(source, work):
    """A copy of the flash image, sized like an SD card."""
    card = os.path.join(work, "card.img")
    if source.endswith(".xz"):
        log("unpacking the flash image")
        with lzma.open(source) as packed, open(card, "wb") as out:
            shutil.copyfileobj(packed, out, 4 << 20)
    else:
        shutil.copyfile(source, card)
    if os.path.getsize(card) > CARD_BYTES:
        raise Failure("the flash image is larger than the emulated card")
    os.truncate(card, CARD_BYTES)
    return card


def partitions(card):
    table = json.loads(subprocess.check_output(["sfdisk", "-J", card]))["partitiontable"]
    result = {}
    for entry in table["partitions"]:
        number = int(re.search(r"(\d+)$", entry["node"]).group(1))
        result[number] = (entry["start"] * 512, entry["size"] * 512)
    return result


def read_fat_file(card, offset, name):
    return subprocess.run(["mtype", "-i", f"{card}@@{offset}", f"::{name}"], capture_output=True, text=True)


def extract_rootfs(card, table, number, work):
    offset, size = table[number]
    erofs = os.path.join(work, "rootfs.erofs")
    with open(card, "rb") as disk, open(erofs, "wb") as out:
        disk.seek(offset)
        remaining = size
        while remaining > 0:
            block = disk.read(min(4 << 20, remaining))
            if not block:
                break
            out.write(block)
            remaining -= len(block)
    root = os.path.join(work, "rootfs")
    shutil.rmtree(root, ignore_errors=True)
    subprocess.check_call(
        ["fsck.erofs", f"--extract={root}", "--no-preserve-owner", "--preserve-perms", erofs],
        stdout=subprocess.DEVNULL,
    )
    os.remove(erofs)
    return root


def os_release(rootfs):
    values = {}
    with open(os.path.join(rootfs, "usr", "lib", "os-release")) as source:
        for line in source:
            key, _, value = line.strip().partition("=")
            values[key] = value.strip('"')
    return values


# --- Stand-in dashboard ---------------------------------------------------


class Cloud:
    """What the agent needs from the dashboard: pairing, one manifest, media,
    commands, and somewhere to send heartbeats and screenshots."""

    CREDENTIAL = "boot-test-credential"
    DEVICE_ID = "boot-test-screen"

    def __init__(self, artifacts):
        self.lock = threading.Lock()
        self.artifacts = artifacts
        self.requests = open(os.path.join(artifacts, "dashboard-requests.log"), "w", buffering=1)
        self.registrations = 0
        self.claim_polls = 0
        self.claimed = False
        self.manifest_fetches = 0
        self.media_downloads = []
        self.heartbeats = []  # (monotonic time, payload)
        self.pending_commands = []
        self.command_results = {}
        self.screenshots = 0
        self.rejected = 0
        self.unknown = []
        self.media = {}
        items = []
        checksums = {}
        for index, name in enumerate(sorted(os.listdir(MEDIA_DIR)), start=1):
            if not name.endswith(".mp4"):
                continue
            with open(os.path.join(MEDIA_DIR, name), "rb") as source:
                data = source.read()
            self.media[name] = data
            asset = f"asset-{os.path.splitext(name)[0]}"
            checksum = hashlib.sha256(data).hexdigest()
            checksums[asset] = checksum
            items.append({
                "id": f"item-{index}", "assetId": asset, "assetType": "video", "sourceType": "upload",
                "title": name, "url": f"{CLOUD_GUEST_URL}/media/{name}", "checksum": checksum,
                "durationSeconds": 6,
            })
        self.asset_ids = set(checksums)
        self.manifest = {
            "manifestVersion": "boot-test-1", "deviceId": self.DEVICE_ID,
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "timezone": "UTC",
            "orientation": 0, "volume": 50, "defaultPlaylistId": "playlist-boot-test",
            "defaultPlaylist": items, "scheduleWindows": [], "assetBaseUrl": CLOUD_GUEST_URL,
            "assetChecksums": checksums,
        }
        cloud = self

        class Handler(http.server.BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_):
                pass

            def do_GET(self):
                cloud.handle(self, None)

            def do_POST(self):
                length = int(self.headers.get("Content-Length") or 0)
                cloud.handle(self, self.rfile.read(length))

        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def queue_command(self, command_type):
        with self.lock:
            command_id = f"command-{len(self.command_results) + len(self.pending_commands) + 1}-{command_type}"
            self.pending_commands.append({
                "id": command_id, "deviceId": self.DEVICE_ID, "commandType": command_type,
                "issuedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "payload": {},
                "leaseToken": f"lease-{command_id}",
            })
            return command_id

    def reply(self, handler, status, payload=None, raw=None, content_type="application/json", headers=None):
        body = raw if raw is not None else json.dumps(payload if payload is not None else {}).encode()
        handler.send_response(status)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(len(body)))
        for key, value in (headers or {}).items():
            handler.send_header(key, value)
        handler.end_headers()
        handler.wfile.write(body)

    def handle(self, handler, body):
        url = urllib.parse.urlsplit(handler.path)
        path = url.path
        self.requests.write(f"{time.strftime('%H:%M:%S')} {handler.command} {handler.path}\n")
        try:
            if path.startswith("/media/"):
                return self.serve_media(handler, path[len("/media/"):])
            if path == "/api/device/register-temporary":
                with self.lock:
                    self.registrations += 1
                    self.claim_polls = 0
                return self.reply(handler, 200, {
                    "deviceSessionId": "boot-test-session", "claimCode": "BOOT42",
                    "claimToken": "boot-test-claim-token", "pollingIntervalSeconds": 3,
                })
            if path == "/api/device/claim-status":
                request = json.loads(body or b"{}")
                if request.get("claimToken") != "boot-test-claim-token":
                    return self.reply(handler, 404, {"error": "unknown session"})
                with self.lock:
                    self.claim_polls += 1
                    # Leave the pairing code on screen for a few polls first.
                    if self.claim_polls < 3:
                        return self.reply(handler, 200, {"claimed": False, "pollAgainSeconds": 3})
                    self.claimed = True
                return self.reply(handler, 200, {
                    "claimed": True, "deviceId": self.DEVICE_ID, "credential": self.CREDENTIAL,
                    "expiresInSeconds": 86400,
                })
            if handler.headers.get("Authorization") != f"Bearer {self.CREDENTIAL}":
                with self.lock:
                    self.rejected += 1
                return self.reply(handler, 401, {"error": "unauthorized"})
            if path == "/api/device/auth/refresh":
                return self.reply(handler, 200, {
                    "deviceId": self.DEVICE_ID, "credential": self.CREDENTIAL, "expiresInSeconds": 86400,
                })
            if path == "/api/device/manifest":
                with self.lock:
                    self.manifest_fetches += 1
                return self.reply(handler, 200, {"manifest": self.manifest})
            if path == "/api/device/commands":
                wait = min(int(urllib.parse.parse_qs(url.query).get("waitSeconds", ["0"])[0] or 0), 10)
                deadline = time.monotonic() + wait
                while True:
                    with self.lock:
                        commands = list(self.pending_commands)
                    if commands or time.monotonic() >= deadline:
                        break
                    time.sleep(0.5)
                return self.reply(handler, 200, {
                    "commands": commands, "manifestVersion": self.manifest["manifestVersion"],
                })
            if path == "/api/device/command-result":
                result = json.loads(body or b"{}")
                with self.lock:
                    self.command_results[result.get("commandId")] = result
                    self.pending_commands = [c for c in self.pending_commands if c["id"] != result.get("commandId")]
                return self.reply(handler, 200, {})
            if path == "/api/device/heartbeat":
                with self.lock:
                    self.heartbeats.append((time.monotonic(), json.loads(body or b"{}")))
                return self.reply(handler, 200, {})
            if path == "/api/device/screenshot":
                self.save_screenshot(handler, body)
                return self.reply(handler, 200, {})
            if path == "/api/device/tailscale":
                # Remote access is not configured on this dashboard.
                return self.reply(handler, 404, {"error": "not configured"})
            with self.lock:
                self.unknown.append(f"{handler.command} {path}")
            return self.reply(handler, 404, {"error": "not found"})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def serve_media(self, handler, name):
        data = self.media.get(name)
        if data is None:
            return self.reply(handler, 404, {"error": "not found"})
        with self.lock:
            self.media_downloads.append(name)
        requested = re.fullmatch(r"bytes=(\d+)-", handler.headers.get("Range") or "")
        if requested:
            start = int(requested.group(1))
            if start >= len(data):
                return self.reply(handler, 416, {"error": "range"})
            return self.reply(handler, 206, raw=data[start:], content_type="video/mp4",
                              headers={"Content-Range": f"bytes {start}-{len(data) - 1}/{len(data)}"})
        return self.reply(handler, 200, raw=data, content_type="video/mp4")

    def save_screenshot(self, handler, body):
        message = email.parser.BytesParser(policy=email.policy.HTTP).parsebytes(
            b"Content-Type: " + handler.headers.get("Content-Type", "").encode() + b"\r\n\r\n" + (body or b"")
        )
        for part in message.iter_parts():
            if part.get_filename():
                with open(os.path.join(self.artifacts, "dashboard-screenshot.jpg"), "wb") as out:
                    out.write(part.get_payload(decode=True))
                with self.lock:
                    self.screenshots += 1

    def playing_heartbeats(self, since):
        with self.lock:
            return [
                payload for at, payload in self.heartbeats
                if at >= since and payload.get("currentAssetId") in self.asset_ids
                and (payload.get("health") or {}).get("playerHealthy")
            ]


def relay(port):
    """QEMU starts this for every connection the guest opens to the stand-in
    dashboard: it joins stdin/stdout to the harness's HTTP server."""
    connection = socket.create_connection(("127.0.0.1", port))

    def upstream():
        try:
            while True:
                data = os.read(0, 65536)
                if not data:
                    break
                connection.sendall(data)
        except OSError:
            pass
        try:
            connection.shutdown(socket.SHUT_WR)
        except OSError:
            pass

    threading.Thread(target=upstream, daemon=True).start()
    try:
        while True:
            data = connection.recv(65536)
            if not data:
                break
            os.write(1, data)
    except OSError:
        pass


# --- QEMU -----------------------------------------------------------------


class Machine:
    def __init__(self, work, artifacts, vmlinuz, initramfs, card, cmdline, cloud_port, memory, cpus):
        self.serial_path = os.path.join(artifacts, "serial.log")
        self.qmp_path = os.path.join(work, "qmp.sock")
        open(self.serial_path, "w").close()
        relay_command = " ".join(shlex.quote(part) for part in (sys.executable, os.path.abspath(__file__), "--relay", str(cloud_port)))
        netdev = "user,id=net0,restrict=on,guestfwd=tcp:10.0.2.100:80-cmd:" + relay_command.replace(",", ",,")
        accel = ["-accel", "kvm", "-cpu", "host"] if kvm_usable() else ["-accel", "tcg,thread=multi", "-cpu", "cortex-a76"]
        command = [
            "qemu-system-aarch64", "-M", "virt,gic-version=3", *accel, "-smp", str(cpus), "-m", str(memory),
            "-kernel", vmlinuz, "-initrd", initramfs, "-append", cmdline,
            # The flash image as the SD card, so devices are named as on a Pi.
            "-device", "sdhci-pci", "-drive", f"if=none,id=card,format=raw,file={card}", "-device", "sd-card,drive=card",
            "-device", "virtio-gpu-pci,xres=1920,yres=1080",
            "-netdev", netdev, "-device", "virtio-net-pci,netdev=net0,romfile=",
            "-device", "virtio-rng-pci",
            "-display", "none", "-serial", f"file:{self.serial_path}", "-monitor", "none",
            "-qmp", f"unix:{self.qmp_path},server=on,wait=off",
        ]
        self.process = subprocess.Popen(command, stdin=subprocess.DEVNULL)
        self.offset = 0
        self.text = ""

    def poll(self):
        """Reads new serial output. Returns the whole log so far."""
        with open(self.serial_path, "rb") as source:
            source.seek(self.offset)
            data = source.read()
        self.offset += len(data)
        self.text += data.decode("utf-8", "replace")
        if self.process.poll() is not None:
            raise Failure(f"QEMU exited with status {self.process.returncode}")
        return self.text

    def qmp(self, command, **arguments):
        with socket.socket(socket.AF_UNIX) as connection:
            connection.settimeout(60)
            connection.connect(self.qmp_path)
            stream = connection.makefile("rw")
            json.loads(stream.readline())
            for execute, args in (("qmp_capabilities", {}), (command, arguments)):
                stream.write(json.dumps({"execute": execute, "arguments": args}) + "\n")
                stream.flush()
                while True:
                    answer = json.loads(stream.readline())
                    if "return" in answer or "error" in answer:
                        break
            if "error" in answer:
                raise Failure(f"QEMU {command}: {answer['error'].get('desc')}")
            return answer["return"]

    def stop(self):
        if self.process.poll() is None:
            try:
                self.qmp("quit")
                self.process.wait(timeout=20)
            except Exception:
                self.process.kill()
                self.process.wait()


def kvm_usable():
    return os.uname().machine == "aarch64" and os.access("/dev/kvm", os.R_OK | os.W_OK)


def picture_on_screen(path):
    """Whether a PPM screen dump shows a picture: a share of pixels that are
    not near black, in more than a handful of colours."""
    with open(path, "rb") as source:
        data = source.read()
    fields = data.split(None, 4)
    if fields[0] != b"P6" or len(fields) < 5:
        raise Failure("unexpected screen dump format")
    width, height, pixels = int(fields[1]), int(fields[2]), fields[4]
    lit = 0
    colours = set()
    sampled = 0
    for y in range(0, height, 8):
        row = y * width * 3
        for x in range(0, width, 8):
            r, g, b = pixels[row + x * 3: row + x * 3 + 3]
            sampled += 1
            if max(r, g, b) > 48:
                lit += 1
            colours.add((r >> 4, g >> 4, b >> 4))
    return lit / max(sampled, 1), len(colours), (width, height)


# --- The run --------------------------------------------------------------


class Run:
    def __init__(self, machine, cloud, artifacts, deadline):
        self.machine = machine
        self.cloud = cloud
        self.artifacts = artifacts
        self.deadline = deadline

    def serial(self):
        text = self.machine.poll()
        if "Kernel panic" in text:
            raise Failure("the kernel panicked")
        return text

    def boots(self):
        return self.serial().count(BOOT_MARKER)

    def wait(self, what, condition, seconds, boots):
        """Waits for condition(); fails on timeout or an unexpected restart."""
        log(f"waiting for {what}")
        limit = min(time.monotonic() + seconds, self.deadline)
        while True:
            value = condition()
            if value:
                return value
            count = self.boots()
            if count > boots:
                raise Failure(f"the screen restarted unexpectedly while waiting for {what} (boot {count}, expected {boots})")
            if time.monotonic() > limit:
                raise Failure(f"timed out waiting for {what}")
            time.sleep(1)

    def selftest_after(self, boot):
        """The self-test result printed during the given boot, or None."""
        text = self.serial()
        start = -1
        for _ in range(boot):
            start = text.find(BOOT_MARKER, start + 1)
            if start < 0:
                return None
        section = text[start:]
        following = section.find(BOOT_MARKER, 1)
        if following > 0:
            section = section[:following]
        match = re.search(re.escape(RESULT_MARKER) + r"(PASS|FAIL)[^\r\n]*", section)
        if not match:
            return None
        if match.group(1) == "FAIL":
            report = section[max(section.rfind("Showroom self-test:", 0, match.start()), 0):match.end()]
            raise Failure("the on-device self-test failed:\n" + report.replace("\r", ""))
        return match.group(0)


def run(args):
    need("qemu-system-aarch64", "fsck.erofs", "mtype", "mcopy", "sfdisk", "zstd", "dpkg-deb")
    work = os.path.abspath(args.work)
    artifacts = os.path.abspath(args.artifacts)
    os.makedirs(work, exist_ok=True)
    os.makedirs(artifacts, exist_ok=True)

    vmlinuz, modules_dir = fetch_kernel(os.path.abspath(args.kernel_cache))
    card = prepare_card(args.image, work)
    table = partitions(card)

    # Boot what the firmware would: the slot autoboot.txt names, with that
    # slot's own kernel command line.
    autoboot = read_fat_file(card, table[1][0], "autoboot.txt").stdout
    boot_partition = int((re.search(r"boot_partition=(\d+)", autoboot) or [0, 2])[1])
    image_cmdline = read_fat_file(card, table[boot_partition][0], "cmdline.txt").stdout.strip()
    root = re.search(r"root=PARTUUID=[0-9a-fA-F]+-(\d+)", image_cmdline)
    if not root:
        raise Failure(f"cannot find the root partition in the image's cmdline.txt: {image_cmdline!r}")
    root_number = int(root.group(1))
    rootfs = extract_rootfs(card, table, root_number, work)
    release = os_release(rootfs)
    version = release.get("VERSION_ID", "")
    log(f"image: {release.get('PRETTY_NAME')}, boot partition {boot_partition}, root partition {root_number}")

    initramfs = os.path.join(work, "initramfs.cpio")
    build_initramfs(rootfs, modules_dir, initramfs)
    shutil.rmtree(rootfs, ignore_errors=True)

    # The image's command line with QEMU's serial port as the console. The
    # player draws with plain KMS because QEMU has no VideoCore GPU, and a
    # development image must not replace itself from the dev channel.
    kept = [word for word in image_cmdline.split() if not word.startswith("console=")]
    cmdline = " ".join(kept + [
        "console=tty1", "console=ttyAMA0", f"showroomtest.root=/dev/mmcblk0p{root_number}",
        "systemd.setenv=SHOWROOM_MPV_VO=drm", "systemd.wants=showroom-test-selftest.service",
        "systemd.mask=showroom-os-follow.timer", "systemd.mask=showroom-os-follow.service",
    ] + args.append)

    cloud = Cloud(artifacts)
    started = time.monotonic()
    machine = Machine(work, artifacts, vmlinuz, initramfs, card, cmdline, cloud.port, args.memory, args.cpus)
    test = Run(machine, cloud, artifacts, started + args.timeout)
    try:
        log("power on")
        test.wait("the first boot", lambda: test.boots() >= 1, 180, 1)
        test.wait("the restart after growing the data partition", lambda: test.boots() >= 2, 600, 2)

        test.wait("the screen to ask for a pairing code", lambda: cloud.registrations >= 1, 600, 2)
        test.wait("the screen to be paired", lambda: cloud.claimed, 300, 2)
        test.wait("the playlist to be downloaded", lambda: set(cloud.media_downloads) >= set(cloud.media), 600, 2)
        test.wait("a heartbeat that reports playback", lambda: cloud.playing_heartbeats(started), 720, 2)
        result = test.wait("the on-device self-test", lambda: test.selftest_after(2), 1000, 2)
        log(result)

        heartbeat = cloud.playing_heartbeats(started)[-1]
        problems = []
        if version and heartbeat.get("agentVersion") != version:
            problems.append(f"agent reports version {heartbeat.get('agentVersion')!r}, the image is {version}")
        if version and heartbeat.get("appVersion") != version:
            problems.append(f"player reports version {heartbeat.get('appVersion')!r}, the image is {version}")
        if version and version not in ((heartbeat.get("health") or {}).get("osVersion") or ""):
            problems.append(f"heartbeat OS version is {(heartbeat.get('health') or {}).get('osVersion')!r}")
        if "system_bundles" not in ((heartbeat.get("appliance") or {}).get("capabilities") or []):
            problems.append("the screen does not offer OS updates (no system_bundles capability)")
        sync_error = (heartbeat.get("sync") or {}).get("lastError")
        if sync_error:
            problems.append(f"the screen reports a content problem: {sync_error}")
        if problems:
            raise Failure("; ".join(problems))
        log(f"heartbeat: playing {heartbeat.get('currentAssetId')}, agent and player {version}")

        dump = os.path.join(work, "screen.ppm")
        machine.qmp("screendump", filename=dump)
        machine.qmp("screendump", filename=os.path.join(artifacts, "screen.png"), format="png")
        lit, colours, size = picture_on_screen(dump)
        log(f"display: {size[0]}x{size[1]}, {lit:.0%} of it lit, {colours} colours")
        if lit < 0.2 or colours < 8:
            raise Failure("the display is blank or nearly blank while the player reports playback (see screen.png)")

        screenshot = cloud.queue_command("take_screenshot")
        test.wait("a dashboard screenshot", lambda: cloud.screenshots >= 1 and screenshot in cloud.command_results, 300, 2)
        if cloud.command_results[screenshot].get("status") not in ("succeeded", "success", "completed"):
            raise Failure(f"the screenshot command reported {cloud.command_results[screenshot]}")

        registrations = cloud.registrations
        restart = cloud.queue_command("reboot_device")
        test.wait("the restart ordered from the dashboard", lambda: test.boots() >= 3, 600, 3)
        restarted_at = time.monotonic()
        if restart not in cloud.command_results:
            raise Failure("the screen restarted without reporting the restart command as done")
        test.wait("playback after the restart", lambda: cloud.playing_heartbeats(restarted_at), 720, 3)
        result = test.wait("the self-test after the restart", lambda: test.selftest_after(3), 1000, 3)
        log(result)
        if cloud.registrations != registrations or cloud.rejected:
            raise Failure("the screen lost its pairing over the restart")

        log(f"watching for {args.soak} more seconds")
        soak_until = time.monotonic() + args.soak
        while time.monotonic() < soak_until:
            if test.boots() > 3:
                raise Failure("the screen restarted by itself after it was up and playing")
            time.sleep(2)
        if not cloud.playing_heartbeats(soak_until - max(args.soak, 90)):
            raise Failure("heartbeats stopped reporting playback")
        if cloud.unknown:
            log("note: requests the stand-in dashboard does not know: " + ", ".join(sorted(set(cloud.unknown))))
        log(f"PASS in {int(time.monotonic() - started)} s: 3 boots as expected, {len(cloud.heartbeats)} heartbeats")
        return 0
    except Failure as failure:
        try:
            machine.qmp("screendump", filename=os.path.join(artifacts, "screen-at-failure.png"), format="png")
        except Exception:
            pass
        text = machine.text.replace("\r", "")
        print("\n--- last 120 lines of the serial console ---")
        print("\n".join(text.splitlines()[-120:]))
        print(f"\nFAIL: {failure}", flush=True)
        return 1
    finally:
        machine.stop()
        # Development images copy their journal to the AUTOBOOT partition.
        for name in ("current-boot.txt", "previous-boot.txt"):
            subprocess.run(
                ["mcopy", "-n", "-i", f"{card}@@{table[1][0]}", f"::showroom-logs/{name}", os.path.join(artifacts, f"journal-{name}")],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
        if not args.keep:
            os.remove(card)


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--relay":
        relay(int(sys.argv[2]))
        return 0
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("image", help="showroom-os-rpi5-<version>.img or .img.xz")
    parser.add_argument("--work", default="boot-test-work", help="scratch directory (the 4 GB card image is written here)")
    parser.add_argument("--artifacts", default="boot-test-results", help="where the serial log, screen dumps and journals go")
    parser.add_argument("--kernel-cache", default=os.path.expanduser("~/.cache/showroom-boot-test"))
    parser.add_argument("--timeout", type=int, default=3000, help="seconds allowed for the whole run")
    parser.add_argument("--soak", type=int, default=120, help="seconds to keep watching after everything passed")
    parser.add_argument("--memory", type=int, default=2048, help="guest memory in MiB")
    parser.add_argument("--cpus", type=int, default=min(4, os.cpu_count() or 1))
    parser.add_argument("--append", action="append", default=[], metavar="WORD",
                        help="extra kernel command line word, for trying a failure (systemd.mask=showroom-kiosk.service)")
    parser.add_argument("--keep", action="store_true", help="keep the card image afterwards")
    args = parser.parse_args()
    try:
        return run(args)
    except Failure as failure:
        print(f"FAIL: {failure}", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
