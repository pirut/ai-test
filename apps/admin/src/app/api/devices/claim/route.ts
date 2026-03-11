import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { claimDevice } from "@/lib/backend";

const schema = z.object({
  claimCode: z.string().length(6),
  name: z.string().min(2),
  siteName: z.string().min(2),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());
  const result = await claimDevice({
    orgId: session.orgId,
    ...payload,
  });

  if (!result) {
    return NextResponse.json({ error: "Invalid claim code" }, { status: 404 });
  }

  return NextResponse.json(result, { status: 201 });
}
