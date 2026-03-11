const canonicalHost = "www.youtube.com";
const validVideoId = /^[A-Za-z0-9_-]{11}$/;

function parseUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function sanitizeVideoId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextValue = value.trim();
  return validVideoId.test(nextValue) ? nextValue : null;
}

export function extractYouTubeVideoId(rawUrl: string) {
  const parsed = parseUrl(rawUrl.trim());
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    return sanitizeVideoId(parsed.pathname.split("/").filter(Boolean)[0]);
  }

  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
    return null;
  }

  if (parsed.pathname === "/watch") {
    return sanitizeVideoId(parsed.searchParams.get("v"));
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  if (["shorts", "embed", "live"].includes(segments[0])) {
    return sanitizeVideoId(segments[1]);
  }

  return null;
}

export function normalizeYouTubeUrl(rawUrl: string) {
  const videoId = extractYouTubeVideoId(rawUrl);
  if (!videoId) {
    throw new Error("Enter a valid YouTube video URL.");
  }

  return {
    videoId,
    url: `https://${canonicalHost}/watch?v=${videoId}`,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function fetchOEmbedMetadata(url: string) {
  const response = await fetch(
    `https://${canonicalHost}/oembed?url=${encodeURIComponent(url)}&format=json`,
    {
      signal: AbortSignal.timeout(5000),
    },
  ).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => null)) as
    | {
        title?: string;
        thumbnail_url?: string;
      }
    | null;

  if (!payload) {
    return null;
  }

  return {
    title: payload.title?.trim() || undefined,
    thumbnailUrl: payload.thumbnail_url?.trim() || undefined,
  };
}

export async function resolveYouTubeImport(rawUrl: string, preferredTitle?: string) {
  const normalized = normalizeYouTubeUrl(rawUrl);
  const metadata = await fetchOEmbedMetadata(normalized.url);
  const title =
    preferredTitle?.trim() ||
    metadata?.title ||
    `YouTube video ${normalized.videoId}`;
  const fileStem = slugify(title) || normalized.videoId.toLowerCase();

  return {
    videoId: normalized.videoId,
    sourceUrl: normalized.url,
    title,
    fileName: `${fileStem}-${normalized.videoId}.mp4`,
    previewUrl:
      metadata?.thumbnailUrl ||
      `https://i.ytimg.com/vi/${normalized.videoId}/hqdefault.jpg`,
  };
}
