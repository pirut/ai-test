import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { deleteMediaAsset, updateMediaAsset } from "@/lib/backend";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  await deleteMediaAsset(id);
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  folderId: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update",
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { id } = await params;
  const payload = patchSchema.parse(await request.json());
  const asset = await updateMediaAsset({
    assetId: id,
    title: payload.title,
    tags: payload.tags,
    folderId: payload.folderId,
  });
  return NextResponse.json({ asset });
}
