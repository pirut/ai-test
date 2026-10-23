include $(sort $(wildcard $(BR2_EXTERNAL_SHOWROOM_PATH)/package/*/*.mk))

# Raspberry Pi's V4L2 request decoder (patches/ffmpeg) finds the HEVC block
# through libudev, so FFmpeg has to be configured after udev is in staging.
# ffmpeg.mk has no udev dependency of its own, and appending to
# FFMPEG_DEPENDENCIES here would be too late, so add the ordering directly.
ifeq ($(BR2_PACKAGE_FFMPEG)$(BR2_PACKAGE_HAS_UDEV),yy)
$(FFMPEG_TARGET_CONFIGURE): | udev
endif
