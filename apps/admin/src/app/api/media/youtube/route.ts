import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { createYouTubeMediaAsset } from "@/lib/backend";
import { normalizePastedUrl, resolveYouTubeImport } from "@/lib/youtube";

const schema = z.object({
  url: z.string().trim().min(1),
  title: z.string().trim().optional(),
  tags: z.array(z.string()).default([]),
  folderId: z.string().nullable().optional(),
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
    const youtube = await resolveYouTubeImport(normalizePastedUrl(payload.url), payload.title);

    return NextResponse.json(
      {
        asset: await createYouTubeMediaAsset({
          title: youtube.title,
          sourceUrl: youtube.sourceUrl,
          previewUrl: youtube.previewUrl,
          fileName: youtube.fileName,
          tags: payload.tags,
          folderId: payload.folderId,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("YouTube video import failed", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to import YouTube video",
      },
      { status: 400 },
    );
  }
}
