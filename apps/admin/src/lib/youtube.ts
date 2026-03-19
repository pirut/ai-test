const canonicalHost = "www.youtube.com";
const validVideoId = /^[A-Za-z0-9_-]{11}$/;
const validPlaylistId = /^[A-Za-z0-9_-]{10,}$/;
const defaultFetchHeaders = {
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
};
const maxPlaylistVideos = 500;
const maxPlaylistContinuationRequests = 20;

export type YouTubePlaylistImportVideo = {
  durationSeconds?: number;
  fileName: string;
  previewUrl: string;
  sourceUrl: string;
  title: string;
  videoId: string;
};

export type YouTubePlaylistImport = {
  playlistId: string;
  sourceUrl: string;
  title: string;
  videos: YouTubePlaylistImportVideo[];
};

function parseUrl(rawUrl: string) {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

export function normalizePastedUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function sanitizeVideoId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextValue = value.trim();
  return validVideoId.test(nextValue) ? nextValue : null;
}

function sanitizePlaylistId(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const nextValue = value.trim();
  return validPlaylistId.test(nextValue) ? nextValue : null;
}

export function extractYouTubeVideoId(rawUrl: string) {
  const parsed = parseUrl(normalizePastedUrl(rawUrl));
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

export function extractYouTubePlaylistId(rawUrl: string) {
  const parsed = parseUrl(normalizePastedUrl(rawUrl));
  if (!parsed) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) {
    return null;
  }

  return sanitizePlaylistId(parsed.searchParams.get("list"));
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

export function normalizeYouTubePlaylistUrl(rawUrl: string) {
  const playlistId = extractYouTubePlaylistId(rawUrl);
  if (!playlistId) {
    throw new Error("Enter a valid YouTube playlist URL.");
  }

  return {
    playlistId,
    url: `https://${canonicalHost}/playlist?list=${playlistId}`,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function decodeJsonString(value: string) {
  return JSON.parse(`"${value}"`) as string;
}

function extractJsonObject(source: string, prefix: string) {
  const start = source.indexOf(prefix);
  if (start < 0) {
    throw new Error("Unable to read playlist data from YouTube.");
  }

  let cursor = start + prefix.length;
  while (cursor < source.length && source[cursor] !== "{") {
    cursor += 1;
  }

  if (source[cursor] !== "{") {
    throw new Error("Unable to read playlist data from YouTube.");
  }

  const begin = cursor;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (; cursor < source.length; cursor += 1) {
    const char = source[cursor]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(source.slice(begin, cursor + 1)) as Record<string, unknown>;
      }
    }
  }

  throw new Error("Unable to read playlist data from YouTube.");
}

function extractConfigString(source: string, key: string) {
  const pattern = new RegExp(`"${key}":"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`);
  const match = source.match(pattern);
  return match?.[1] ? decodeJsonString(match[1]) : null;
}

function walkJson(node: unknown, visitor: (value: Record<string, unknown>) => void) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (Array.isArray(node)) {
    for (const entry of node) {
      walkJson(entry, visitor);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  visitor(record);
  for (const value of Object.values(record)) {
    walkJson(value, visitor);
  }
}

function getRunsText(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as {
    runs?: Array<{ text?: string }>;
    simpleText?: string;
  };

  if (typeof record.simpleText === "string" && record.simpleText.trim()) {
    return record.simpleText.trim();
  }

  const text = record.runs
    ?.map((entry) => entry.text?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .join("");

  return text?.trim() || null;
}

function getThumbnailUrl(value: unknown, fallbackUrl: string) {
  if (!value || typeof value !== "object") {
    return fallbackUrl;
  }

  const thumbnails = (value as { thumbnails?: Array<{ url?: string }> }).thumbnails ?? [];
  return thumbnails.at(-1)?.url?.trim() || thumbnails[0]?.url?.trim() || fallbackUrl;
}

function normalizePlaylistVideo(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const renderer = value as {
    isPlayable?: boolean;
    lengthSeconds?: string;
    navigationEndpoint?: { watchEndpoint?: { videoId?: string } };
    thumbnail?: { thumbnails?: Array<{ url?: string }> };
    title?: unknown;
    videoId?: string;
  };

  if (renderer.isPlayable === false) {
    return null;
  }

  const videoId = sanitizeVideoId(renderer.videoId ?? renderer.navigationEndpoint?.watchEndpoint?.videoId);
  if (!videoId) {
    return null;
  }

  const title = getRunsText(renderer.title) || `YouTube video ${videoId}`;
  const sourceUrl = `https://${canonicalHost}/watch?v=${videoId}`;
  const previewUrl = getThumbnailUrl(
    renderer.thumbnail,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  );
  const durationSeconds = Number(renderer.lengthSeconds);
  const fileStem = slugify(title) || videoId.toLowerCase();

  return {
    durationSeconds:
      Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : undefined,
    fileName: `${fileStem}-${videoId}.mp4`,
    previewUrl,
    sourceUrl,
    title,
    videoId,
  } satisfies YouTubePlaylistImportVideo;
}

function collectPlaylistData(value: unknown) {
  const videos = new Map<string, YouTubePlaylistImportVideo>();
  let continuationToken: string | null = null;

  walkJson(value, (entry) => {
    const renderer = entry.playlistVideoRenderer;
    const video = normalizePlaylistVideo(renderer);
    if (video && !videos.has(video.videoId)) {
      videos.set(video.videoId, video);
    }

    const continuation =
      (entry.continuationItemRenderer as
        | {
            continuationEndpoint?: {
              continuationCommand?: { token?: string };
            };
          }
        | undefined)?.continuationEndpoint?.continuationCommand?.token ?? null;

    if (!continuationToken && continuation) {
      continuationToken = continuation;
    }
  });

  return {
    continuationToken,
    videos: [...videos.values()],
  };
}

async function fetchYouTubeText(url: string, label: string) {
  const response = await fetch(url, {
    headers: defaultFetchHeaders,
    signal: AbortSignal.timeout(10000),
  }).catch(() => null);

  if (!response?.ok) {
    throw new Error(`Unable to load the YouTube ${label}.`);
  }

  return response.text();
}

async function fetchPlaylistContinuation(input: {
  apiKey: string;
  clientVersion: string;
  continuationToken: string;
  visitorData: string;
}) {
  const response = await fetch(
    `https://${canonicalHost}/youtubei/v1/browse?prettyPrint=false&key=${encodeURIComponent(
      input.apiKey,
    )}`,
    {
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: input.clientVersion,
            visitorData: input.visitorData,
          },
        },
        continuation: input.continuationToken,
      }),
      headers: {
        ...defaultFetchHeaders,
        "Content-Type": "application/json",
        "X-YouTube-Client-Name": "1",
        "X-YouTube-Client-Version": input.clientVersion,
      },
      method: "POST",
      signal: AbortSignal.timeout(10000),
    },
  ).catch(() => null);

  if (!response?.ok) {
    throw new Error("Unable to load the rest of the YouTube playlist.");
  }

  return (await response.json()) as Record<string, unknown>;
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

export async function resolveYouTubePlaylistImport(rawUrl: string) {
  const normalized = normalizeYouTubePlaylistUrl(rawUrl);
  const html = await fetchYouTubeText(normalized.url, "playlist");
  const initialData = extractJsonObject(html, "var ytInitialData = ");
  const apiKey = extractConfigString(html, "INNERTUBE_API_KEY");
  const clientVersion = extractConfigString(html, "INNERTUBE_CLIENT_VERSION");
  const visitorData = extractConfigString(html, "visitorData");

  if (!apiKey || !clientVersion || !visitorData) {
    throw new Error("Unable to read YouTube playlist metadata.");
  }

  const initial = collectPlaylistData(initialData);
  const videos = new Map(initial.videos.map((video) => [video.videoId, video]));
  const seenTokens = new Set<string>();
  let continuationToken = initial.continuationToken;
  let continuationRequests = 0;

  while (
    continuationToken &&
    !seenTokens.has(continuationToken) &&
    continuationRequests < maxPlaylistContinuationRequests &&
    videos.size < maxPlaylistVideos
  ) {
    seenTokens.add(continuationToken);
    continuationRequests += 1;

    const page = await fetchPlaylistContinuation({
      apiKey,
      clientVersion,
      continuationToken,
      visitorData,
    });
    const nextPage = collectPlaylistData(page);
    for (const video of nextPage.videos) {
      if (videos.size >= maxPlaylistVideos) {
        break;
      }
      videos.set(video.videoId, video);
    }

    continuationToken = nextPage.continuationToken;
  }

  const title =
    (initialData.metadata as { playlistMetadataRenderer?: { title?: string } } | undefined)
      ?.playlistMetadataRenderer?.title
      ?.trim() || `YouTube playlist ${normalized.playlistId}`;

  if (videos.size === 0) {
    throw new Error("No playable videos were found in that YouTube playlist.");
  }

  return {
    playlistId: normalized.playlistId,
    sourceUrl: normalized.url,
    title,
    videos: [...videos.values()],
  } satisfies YouTubePlaylistImport;
}
