import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { deleteMediaAsset, updateMediaAsset } from "@/lib/backend";

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
  await deleteMediaAsset(id);
  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

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
  const payload = patchSchema.parse(await request.json());
  const asset = await updateMediaAsset(id, payload.title, payload.tags);
  return NextResponse.json({ asset });
}
