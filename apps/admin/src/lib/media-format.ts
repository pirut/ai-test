import type { MediaAsset } from "@showroom/contracts";

export function prettyBytes(bytes: number) {
  if (bytes <= 0) {
    return "—";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

export function formatDuration(seconds: number) {
  const total = Math.ceil(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDimensions(asset: MediaAsset) {
  if (asset.width && asset.height) {
    return `${asset.width}×${asset.height}`;
  }
  return null;
}

export function assetKindLabel(asset: MediaAsset) {
  if (asset.sourceType === "youtube") return "YouTube";
  return asset.type === "video" ? "Video" : "Image";
}

/** One short line of facts for a card or row: length for videos, size otherwise. */
export function assetSummary(asset: MediaAsset) {
  const parts = [assetKindLabel(asset)];
  if (asset.type === "video" && asset.durationSeconds) {
    parts.push(formatDuration(asset.durationSeconds));
  } else if (formatDimensions(asset)) {
    parts.push(formatDimensions(asset)!);
  }
  if (asset.sourceType !== "youtube") {
    parts.push(prettyBytes(asset.sizeBytes));
  }
  return parts.join(" · ");
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
