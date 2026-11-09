import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthSession } from "@/lib/auth";
import { controlReleaseRollout } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

const schema = z.object({
  action: z.enum(["pause", "resume", "retry_failed"]),
});

export const POST = withApiErrors(async function POST(
  request: Request,
  { params }: { params: Promise<{ releaseId: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }
  const { releaseId } = await params;
  const payload = schema.parse(await request.json());
  return NextResponse.json(await controlReleaseRollout({ releaseId, action: payload.action }));
});
