import { NextResponse } from "next/server";
import { heartbeatPayloadSchema } from "@showroom/contracts";

import { recordHeartbeatForCredential } from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function POST(request: Request) {
  const payload = heartbeatPayloadSchema.parse(await request.json());
  const heartbeat = await recordHeartbeatForCredential(
    getDeviceCredentialFromRequest(request),
    payload,
  );

  if (!heartbeat) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json({
    heartbeat,
  });
}
