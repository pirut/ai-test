import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { deployRelease } from "@/lib/backend";

const schema = z.object({
  deviceIds: z.array(z.string()).optional(),
});

export async function POST(
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

  const payload = schema.parse(await request.json());
  const { releaseId } = await params;

  return NextResponse.json(
    {
      rollout: await deployRelease({
        releaseId,
        deviceIds: payload.deviceIds,
      }),
    },
    { status: 201 },
  );
}
