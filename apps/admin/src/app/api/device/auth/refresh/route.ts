import { NextResponse } from "next/server";

import { refreshDeviceAuth } from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function POST(request: Request) {
  const credential = getDeviceCredentialFromRequest(request);
  const refreshed = await refreshDeviceAuth(credential);

  if (!refreshed) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json(refreshed);
}
