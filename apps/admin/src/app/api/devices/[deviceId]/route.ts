import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { syncStripeSubscriptionQuantity } from "@/lib/billing/stripe-subscriptions";
import { updateScreen } from "@/lib/backend";

const schema = z.object({
  name: z.string().min(2),
  siteName: z.string().min(2),
  timezone: z.string().min(2),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  volume: z.number().min(0).max(100),
  defaultPlaylistId: z.string().nullable().optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { deviceId } = await params;
  const payload = schema.parse(await request.json());
  const device = await updateScreen({
    deviceId,
    ...payload,
  });

  await syncStripeSubscriptionQuantity(session.orgId).catch(() => null);

  return NextResponse.json({
    device,
  });
}
