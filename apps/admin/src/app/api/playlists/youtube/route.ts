import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { importYouTubePlaylist } from "@/lib/backend";
import { normalizePastedUrl, resolveYouTubePlaylistImport } from "@/lib/youtube";

const schema = z.object({
  makeDefault: z.boolean().optional(),
  name: z.string().trim().optional(),
  tags: z.array(z.string()).default([]),
  folderId: z.string().nullable().optional(),
  assetFolderId: z.string().nullable().optional(),
  url: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const payload = schema.parse(await request.json());
    const normalizedUrl = normalizePastedUrl(payload.url);
    const youtubePlaylist = await resolveYouTubePlaylistImport(normalizedUrl);
    const result = await importYouTubePlaylist({
      makeDefault: payload.makeDefault,
      name: payload.name || youtubePlaylist.title,
      tags: payload.tags,
      folderId: payload.folderId,
      assetFolderId: payload.assetFolderId,
      videos: youtubePlaylist.videos.map((video) => ({
        durationSeconds: video.durationSeconds,
        fileName: video.fileName,
        previewUrl: video.previewUrl,
        sourceUrl: video.sourceUrl,
        title: video.title,
      })),
    });

    return NextResponse.json(
      {
        assets: result.assets,
        playlist: result.playlist,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("YouTube playlist import failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import YouTube playlist",
      },
      { status: 400 },
    );
  }
}
