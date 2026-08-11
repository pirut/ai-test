#!/bin/sh

if [ "$(tty 2>/dev/null || true)" = "/dev/tty1" ] && [ -x /usr/local/bin/showroom-recovery-screen ]; then
  failed_service=showroom-kiosk.service
  if [ -r /run/showroom-recovery/failed-service ]; then
    failed_service="$(head -n 1 /run/showroom-recovery/failed-service)"
  fi
  /usr/local/bin/showroom-recovery-screen --failed-service "${failed_service}"
fi
