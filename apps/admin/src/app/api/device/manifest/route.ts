import { NextResponse } from "next/server";

import { getManifestForCredential } from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function GET(request: Request) {
  const manifest = await getManifestForCredential(getDeviceCredentialFromRequest(request));
  if (!manifest) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }
  return NextResponse.json({ manifest });
}
