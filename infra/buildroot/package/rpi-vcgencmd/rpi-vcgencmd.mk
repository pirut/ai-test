################################################################################
#
# rpi-vcgencmd
#
################################################################################

RPI_VCGENCMD_VERSION = b57c48e97f7f43d95d86334798650cfda1ebc8a1
RPI_VCGENCMD_SITE = $(RPI_VCGENCMD_PKGDIR)/src
RPI_VCGENCMD_SITE_METHOD = local
RPI_VCGENCMD_LICENSE = BSD-3-Clause
RPI_VCGENCMD_LICENSE_FILES = LICENCE

define RPI_VCGENCMD_BUILD_CMDS
	$(TARGET_CC) $(TARGET_CFLAGS) $(TARGET_LDFLAGS) -o $(@D)/vcgencmd $(@D)/vcgencmd.c
endef

define RPI_VCGENCMD_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(@D)/vcgencmd $(TARGET_DIR)/usr/bin/vcgencmd
endef

$(eval $(generic-package))
