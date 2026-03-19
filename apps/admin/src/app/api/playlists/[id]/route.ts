import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { deletePlaylist, setDefaultPlaylist, updatePlaylist } from "@/lib/backend";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  await deletePlaylist(id);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.text();
  if (!body) {
    return NextResponse.json({
      playlist: await setDefaultPlaylist(id),
    });
  }

  const payload = z
    .object({
      action: z.literal("setDefault").optional(),
      folderId: z.string().nullable().optional(),
      name: z.string().min(2).optional(),
    })
    .parse(JSON.parse(body));

  if (payload.action === "setDefault") {
    return NextResponse.json({
      playlist: await setDefaultPlaylist(id),
    });
  }

  return NextResponse.json({
    playlist: await updatePlaylist({
      playlistId: id,
      name: payload.name,
      folderId: payload.folderId,
    }),
  });
}
