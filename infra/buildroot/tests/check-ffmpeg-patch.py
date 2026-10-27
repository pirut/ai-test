#!/usr/bin/env python3
"""Fails if the Raspberry Pi FFmpeg patch adds a pixel format without a
descriptor.

A format in enum AVPixelFormat with no entry in av_pix_fmt_descriptors leaves
a nameless hole in the table. mpv walks every format when it opens the GPU
display and dereferences the name, so a hole crashes the player the moment a
TV is connected (AV_PIX_FMT_D3D12 did, in 2026.10.27.12).
"""

import pathlib
import re
import sys

PATCH_DIR = pathlib.Path(__file__).resolve().parent.parent / "patches" / "ffmpeg"


def file_diffs(text):
    return {m.group(1): m.group(0) for m in re.finditer(r"(?ms)^diff --git a/(\S+) .*?(?=^diff --git |\Z)", text)}


def main():
    status = 0
    for patch in sorted(PATCH_DIR.glob("*/*.patch")):
        diffs = file_diffs(patch.read_text(encoding="utf-8"))
        added = re.findall(r"(?m)^\+\s*(AV_PIX_FMT_\w+)\s*,", diffs.get("libavutil/pixfmt.h", ""))
        described = set(re.findall(r"(?m)^\+\s*\[(AV_PIX_FMT_\w+)\]\s*=", diffs.get("libavutil/pixdesc.c", "")))
        for name in added:
            if name not in described:
                print(f"{patch.name}: {name} is added to enum AVPixelFormat without a descriptor in pixdesc.c",
                      file=sys.stderr)
                status = 1
    if status == 0:
        print("check-ffmpeg-patch: every added pixel format has a descriptor")
    return status


if __name__ == "__main__":
    sys.exit(main())
