import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { commandTypeSchema } from "@showroom/contracts";
import { z } from "zod";

import { issueCommand } from "@/lib/backend";

const schema = z.object({
  commandType: commandTypeSchema,
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deviceId } = await params;
  const payload = schema.parse(await request.json());

  if (
    (
      payload.commandType === "reboot_device" ||
      payload.commandType === "restart_player" ||
      payload.commandType === "update_release" ||
      payload.commandType === "update_network"
    ) &&
    !session.has({ role: "org:admin" })
  ) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }
  if (payload.commandType === "update_network") {
    const network = z.object({
      ssid: z.string().trim().min(1).max(32),
      password: z.string().min(8).max(63),
      priority: z.number().int().min(-999).max(999).default(100),
    }).parse(payload.payload);
    payload.payload = network;
  }

  const command = await issueCommand({
    deviceId,
    ...payload,
  });

  return NextResponse.json({ command }, { status: 201 });
}
