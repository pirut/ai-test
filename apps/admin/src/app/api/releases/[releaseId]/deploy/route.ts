import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { deployRelease } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

const schema = z.object({
  deviceIds: z.array(z.string()).optional(),
  // Platform workspaces only: also roll out to every other workspace's screens.
  allWorkspaces: z.boolean().optional(),
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

  const payload = schema.parse(await request.json().catch(() => ({})));
  const { releaseId } = await params;

  return NextResponse.json(
    {
      rollout: await deployRelease({
        releaseId,
        deviceIds: payload.deviceIds,
        allWorkspaces: payload.allWorkspaces,
      }),
    },
    { status: 201 },
  );
});
