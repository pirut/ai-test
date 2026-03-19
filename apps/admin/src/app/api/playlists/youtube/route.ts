import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { importYouTubePlaylist } from "@/lib/backend";
import { resolveYouTubePlaylistImport } from "@/lib/youtube";

const schema = z.object({
  makeDefault: z.boolean().optional(),
  name: z.string().trim().optional(),
  tags: z.array(z.string()).default([]),
  url: z.string().url(),
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
    const youtubePlaylist = await resolveYouTubePlaylistImport(payload.url);
    const result = await importYouTubePlaylist({
      makeDefault: payload.makeDefault,
      name: payload.name || youtubePlaylist.title,
      tags: payload.tags,
      videos: youtubePlaylist.videos,
    });

    return NextResponse.json(
      {
        assets: result.assets,
        playlist: result.playlist,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import YouTube playlist",
      },
      { status: 400 },
    );
  }
}
