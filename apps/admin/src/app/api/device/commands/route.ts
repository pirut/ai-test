import { NextResponse } from "next/server";

import { getCommandsForCredential } from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function GET(request: Request) {
  const commands = await getCommandsForCredential(getDeviceCredentialFromRequest(request));
  if (!commands) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json({ commands });
}
