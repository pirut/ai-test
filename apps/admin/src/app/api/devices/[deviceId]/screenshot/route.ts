import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

import { latestScreenshot } from "@/lib/backend";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deviceId } = await params;
  return NextResponse.json({ screenshot: await latestScreenshot(deviceId) });
}
