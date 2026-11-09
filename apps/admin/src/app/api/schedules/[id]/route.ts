import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

import { deleteSchedule } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

export const DELETE = withApiErrors(async function DELETE(
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
  await deleteSchedule(id);
  return NextResponse.json({ ok: true });
});
