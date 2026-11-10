#!/bin/sh
# tty1 is what a customer sees from power-on until the player takes the
# display, and the maintenance account logs in there by itself. Show one calm
# line while the player starts instead of the recovery text and a shell
# prompt. The recovery screen (20-showroom-console.sh) follows as soon as the
# player is up (it is then behind the player, on Ctrl+Alt+F1), has failed
# once, or two minutes have passed.
if [ "$(tty 2>/dev/null || true)" = "/dev/tty1" ]; then
  showroom_waited=0
  while [ "${showroom_waited}" -lt 120 ] \
    && [ ! -e /run/showroom-recovery/kiosk-failure-count ] \
    && [ "$(systemctl is-active showroom-kiosk.service 2>/dev/null)" != "active" ]; do
    if [ "${showroom_waited}" -eq 0 ]; then
      printf '\033[2J\033[H\n\n    Digital Curator is starting...\n'
    fi
    sleep 1
    showroom_waited=$((showroom_waited + 1))
  done
  unset showroom_waited
fi
