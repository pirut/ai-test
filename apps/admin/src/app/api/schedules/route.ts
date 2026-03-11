import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { saveSchedule } from "@/lib/backend";

const schema = z.object({
  scheduleId: z.string().optional(),
  name: z.string().min(2),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  priority: z.number().int().min(0),
  playlistId: z.string(),
  deviceId: z.string().optional(),
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
      schedule: await saveSchedule(payload),
    },
    { status: 201 },
  );
}
