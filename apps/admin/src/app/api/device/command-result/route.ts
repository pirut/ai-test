import { NextResponse } from "next/server";
import { deviceCommandResultSchema } from "@showroom/contracts";

import { recordCommandResultForCredential } from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function POST(request: Request) {
  const payload = deviceCommandResultSchema.parse(await request.json());
  const result = await recordCommandResultForCredential(
    getDeviceCredentialFromRequest(request),
    payload,
  );

  if (!result) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json({
    result,
  });
}
