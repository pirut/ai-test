import { NextResponse } from "next/server";
import { screenshotUploadPayloadSchema } from "@showroom/contracts";

import { recordScreenshotForCredential } from "@/lib/backend";

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function POST(request: Request) {
  const payload = screenshotUploadPayloadSchema.parse(await request.json());
  const screenshot = await recordScreenshotForCredential(
    getDeviceCredentialFromRequest(request),
    payload,
  );

  if (!screenshot) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json({
    screenshot,
  });
}
