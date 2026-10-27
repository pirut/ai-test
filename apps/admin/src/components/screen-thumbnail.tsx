"use client";

import type { DeviceSummary } from "@showroom/contracts";
import { ImageOff, MonitorOff, MonitorPlay } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 16:9 screenshot of what a screen last showed, or a placeholder that says
 * why there is none. Screens that are not reporting are dimmed so an old
 * picture never reads as live.
 */
export function ScreenThumbnail({
  device,
  className,
  compact = false,
}: {
  device: Pick<DeviceSummary, "name" | "screenshotUrl" | "status">;
  className?: string;
  compact?: boolean;
}) {
  const reporting = device.status === "online";
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  // An image that failed before hydration never fires onError, so check once mounted.
  useEffect(() => {
    const image = imageRef.current;
    if (image && image.complete && image.naturalWidth === 0) setFailedUrl(image.getAttribute("src"));
  }, []);
  const url = device.screenshotUrl && device.screenshotUrl !== failedUrl ? device.screenshotUrl : null;
  return (
    <div className={cn("relative aspect-video overflow-hidden rounded-md border bg-muted", className)}>
      {url ? (
        <img
          src={url}
          alt={`Latest screenshot from ${device.name}`}
          loading="lazy"
          onError={() => setFailedUrl(url)}
          ref={imageRef}
          className={cn("size-full object-cover", !reporting && "opacity-60 grayscale")}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
          {failedUrl ? (
            <ImageOff className="size-5" aria-hidden />
          ) : reporting ? (
            <MonitorPlay className="size-5" aria-hidden />
          ) : (
            <MonitorOff className="size-5" aria-hidden />
          )}
          {compact ? null : (
            <span className="text-xs">{failedUrl ? "Screenshot unavailable" : "No screenshot yet"}</span>
          )}
        </div>
      )}
    </div>
  );
}
