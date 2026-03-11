import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { savePlaylist } from "@/lib/backend";

const schema = z.object({
  playlistId: z.string().optional(),
  name: z.string().min(2),
  itemIds: z.array(
    z.object({
      mediaAssetId: z.string(),
      dwellSeconds: z.number().int().positive().optional(),
    }),
  ),
  makeDefault: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());
  return NextResponse.json(
    {
      playlist: await savePlaylist(payload),
    },
    { status: 201 },
  );
}
