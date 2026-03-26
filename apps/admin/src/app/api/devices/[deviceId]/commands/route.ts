import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
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
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deviceId } = await params;
  const payload = schema.parse(await request.json());

  if (
    (
      payload.commandType === "reboot_device" ||
      payload.commandType === "restart_player" ||
      payload.commandType === "update_release"
    ) &&
    !session.has({ role: "org:admin" })
  ) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const command = await issueCommand({
    deviceId,
    ...payload,
  });

  return NextResponse.json({ command }, { status: 201 });
}
