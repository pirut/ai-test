import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { createRelease } from "@/lib/backend";

const schema = z
  .object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    notes: z.string().trim().optional(),
    playerUrl: z.string().url().optional(),
    playerSha256: z.string().trim().optional(),
    agentUrl: z.string().url().optional(),
    agentSha256: z.string().trim().optional(),
  })
  .refine((value) => Boolean(value.playerUrl || value.agentUrl), {
    message: "Provide a player URL and/or agent URL",
    path: ["playerUrl"],
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
  return NextResponse.json(
    {
      release: await createRelease(payload),
    },
    { status: 201 },
  );
}
