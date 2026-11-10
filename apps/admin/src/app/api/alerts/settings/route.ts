import { maxAlertRecipients, notifyAfterSecondsChoices } from "@showroom/contracts";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withApiErrors } from "@/lib/api-errors";
import { getAuthSession } from "@/lib/auth";
import { saveAlertSettings } from "@/lib/backend";

const schema = z.object({
  enabled: z.boolean(),
  recipients: z.array(z.string().trim().min(1).max(254)).max(maxAlertRecipients),
  notifyAfterSeconds: z
    .number()
    .refine((value) => (notifyAfterSecondsChoices as readonly number[]).includes(value), "Pick one of the listed waiting times"),
});

export const PUT = withApiErrors(async function PUT(request: Request) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());
  return NextResponse.json({ settings: await saveAlertSettings(payload) });
}, "Could not save alert settings. Try again.");
