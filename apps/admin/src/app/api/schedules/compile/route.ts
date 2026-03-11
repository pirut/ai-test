import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { compileManifests } from "@/lib/backend";

export async function POST() {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  return NextResponse.json(await compileManifests(session.orgId));
}
