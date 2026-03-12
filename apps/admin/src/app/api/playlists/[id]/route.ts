import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { deletePlaylist } from "@/lib/backend";

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
