import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { scheduleRecurrenceSchema } from "@showroom/contracts";
import { z } from "zod";

import { saveSchedule } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

// A dated schedule sends startsAt and endsAt; a repeating one sends
// recurrence (days and times on each screen's own clock) instead.
const schema = z
  .object({
    scheduleId: z.string().optional(),
    name: z.string().min(2),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    recurrence: scheduleRecurrenceSchema.optional(),
    priority: z.number().int().min(0),
    playlistId: z.string(),
    deviceId: z.string().optional(),
  })
  .refine((value) => Boolean(value.recurrence) || Boolean(value.startsAt && value.endsAt), {
    message: "A schedule needs a start and end, or days and times to repeat on.",
  });

export const POST = withApiErrors(async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const parsed = schema.parse(await request.json());
  // One kind or the other: a repeating schedule has no dates.
  const payload = parsed.recurrence
    ? { ...parsed, startsAt: undefined, endsAt: undefined }
    : parsed;
  return NextResponse.json(
    {
      schedule: await saveSchedule(payload),
    },
    { status: 201 },
  );
});
