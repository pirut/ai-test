import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

import { compileManifests } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

export const POST = withApiErrors(async function POST() {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  return NextResponse.json(await compileManifests(session.orgId));
});
