import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

import { getDevice } from "@/lib/backend";

// Polled by the "Add screen" flow while it waits for a freshly claimed screen
// to check in for the first time.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ deviceId: string }> },
) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deviceId } = await params;
  const device = await getDevice(session.orgId, deviceId).catch(() => null);
  if (!device) {
    return NextResponse.json({ error: "Screen not found" }, { status: 404 });
  }

  return NextResponse.json(
    {
      deviceId: device.id,
      name: device.name,
      status: device.status,
      connected: device.status === "online",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
