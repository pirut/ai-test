# Fleet operations

## Daily operating model

The dashboard is the normal control plane. Each Pi continues its last verified
playlist without the cloud, reports health every 30 seconds, caches two content
generations, and leases every command so reconnects do not execute it twice.

Health includes player liveness, HDMI, CPU temperature, power/throttle flags,
memory, disk, Wi-Fi signal and address, boot slot, restart counters, and rollback
count. Health transitions are retained as diagnostics; raw heartbeats expire
after 30 days and screenshots after 14 days.

The image workflow rebuilds the supported appliance weekly on GitHub's hosted
arm64 Linux runner. It retains the flash image and the A/B OTA archive as
separate checksummed artifacts alongside the build manifest, configuration, and
SBOM. Promotion remains explicit: inspect the SBOM, soak the candidate, then
publish it to the canary hardware ring in Connect.

## Legacy-safe cutover

The control plane can be deployed before any Pi is reflashed. Existing devices
remain in `legacy protected` mode because their heartbeats do not advertise the
`showroom-appliance-v2` generation, protocol version 2, and the complete fleet
capability set. Legacy heartbeats, manifests, screenshots, content syncs,
preview requests, player restarts, and reboots continue using the original
command protocol.

The first complete heartbeat from the new image is the activation event for one
device. Only then does the backend enable command leases, appliance telemetry
retention, network rotation, and release-rollout eligibility for that device.
Activation is one-way so a transient incomplete heartbeat cannot accidentally
return an appliance to legacy handling. The dashboard labels both states and
disables fleet-only controls for legacy devices.

Telemetry cleanup is scoped to records stamped with the new appliance
generation. Pre-cutover heartbeat, screenshot, and diagnostic history is left
untouched. Deploy-to-all means all activated appliances, never all legacy
devices in the organization.

## Release rings

Agent and player releases progress through 1%, 5%, 25%, and 100% cohorts. A ring
does not advance until every active command finishes. If failures meet the 10%
gate, the rollout pauses. An admin can retry the failed ring or resume after
investigation. Devices verify the server signature and checksum, switch an atomic
version slot, then roll back automatically if the kiosk or health endpoint does
not recover.

Devices without the activated appliance capability contract cannot be selected
for a rollout. If a rollout loses eligibility before a later ring is queued, it
pauses instead of sending the update through the legacy protocol.

Operating-system releases use the matching `*-ota.tar.zst` IDP archive from
`rpi-image-gen` and Raspberry Pi Connect OTA. Never send arbitrary root
filesystem archives through the app release endpoint.

## Network rotation

Stage new Wi-Fi from the device page before retiring the old SSID. The Pi creates
a higher-priority NetworkManager profile and reconnects. The command password is
redacted after delivery. Keep the prior network active until the device reports
the new SSID and IP.

## Break-glass recovery

1. Inspect health and the last screenshot.
2. Request content sync, then restart only the player.
3. Reboot the appliance if the player and agent watchdogs cannot recover it.
4. Use Raspberry Pi Connect remote shell for logs and storage inspection.
5. Use Connect OTA rollback for a bad OS ring.
6. Physically service only power, HDMI, or failed storage that cannot be reached.

## Hardware standard

- Preferred fixed installation: CM5 with eMMC, managed USB-C/PoE power, active
  cooling, at least 32 GB storage, and a short certified HDMI cable.
- Cost-sensitive installation: Pi 5 with high-endurance industrial microSD or
  NVMe of at least 32 GB, official power supply, active cooler, and ventilated enclosure.
- Maintain one cold spare per site and label every Pi, power supply, display, and
  Connect device record with the dashboard device ID.

The image supports Pi 4/5 and CM4/5 profiles, but do not mix update artifacts
between profiles. Soak every hardware/image combination for 72 hours with video,
images, offline playback, power interruption, thermal load, and OTA rollback
before promoting it to the fleet.

## Factory enrollment

Use Raspberry Pi's `rpi-sb-provisioner` for repeatable CM/Pi manufacturing when
volume justifies a fixture. Register a unique Connect for Organisations device
identity from the provisioning station using the Pi firmware crypto key; never
put the organisation Management API token in the image. Map the Connect device
name and tags to the Showroom device/site label. Require organisation 2FA and
keep Connect administrators separate from ordinary remote-shell members.
