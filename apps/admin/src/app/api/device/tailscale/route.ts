import { NextResponse } from "next/server";

import { getManifestForCredential } from "@/lib/backend";
import { getTailscaleJoin, isTailscaleConfigured, readTailscaleConfig } from "@/lib/tailscale";

export const dynamic = "force-dynamic";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

// Screens on images with Tailscale call this until they have joined the
// tailnet. 404 means remote access is not configured, and the screen retries
// later without logging an error.
export async function GET(request: Request) {
  const config = readTailscaleConfig();
  if (!isTailscaleConfigured(config)) {
    return NextResponse.json({ error: "Remote access is not configured" }, { status: 404 });
  }

  const manifest = await getManifestForCredential(getDeviceCredentialFromRequest(request));
  if (!manifest) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  try {
    const join = await getTailscaleJoin(config);
    if (!join) {
      return NextResponse.json({ error: "Remote access is not configured" }, { status: 404 });
    }
    return NextResponse.json(join, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to issue a Tailscale auth key", error);
    return NextResponse.json({ error: "Unable to issue a Tailscale auth key" }, { status: 502 });
  }
}
