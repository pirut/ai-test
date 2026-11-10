import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { removeScreen, updateScreen } from "@/lib/backend";
import { removeTailscaleNode } from "@/lib/tailscale";
import { withApiErrors } from "@/lib/api-errors";

const schema = z.object({
  name: z.string().min(2),
  siteName: z.string().min(2),
  timezone: z.string().min(2),
  orientation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  volume: z.number().min(0).max(100),
  defaultPlaylistId: z.string().nullable().optional(),
});

export const PATCH = withApiErrors(async function PATCH(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { deviceId } = await params;
  const payload = schema.parse(await request.json());
  return NextResponse.json({
    device: await updateScreen({
      deviceId,
      ...payload,
    }),
  });
});

export const DELETE = withApiErrors(async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const { deviceId } = await params;
  try {
    const result = await removeScreen(deviceId, session.orgId);
    // A removed screen must not stay reachable over SSH. Best effort: the
    // screen also logs itself out of the tailnet once it notices the removal.
    await removeTailscaleNode(deviceId).catch((error) => {
      console.error("Could not remove the screen from the tailnet", error);
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove screen";
    const status = /not found/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
});
