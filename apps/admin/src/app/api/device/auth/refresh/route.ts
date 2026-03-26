import { NextResponse } from "next/server";
import { z } from "zod";

import { refreshDeviceAuth } from "@/lib/backend";

const bodySchema = z.object({
  credential: z.string().min(1).optional(),
});

async function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  const payload = bodySchema.safeParse(await request.json().catch(() => null));
  return payload.success ? payload.data.credential ?? null : null;
}

export async function POST(request: Request) {
  const credential = await getDeviceCredentialFromRequest(request);
  const refreshed = await refreshDeviceAuth(credential);

  if (!refreshed) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  return NextResponse.json(refreshed);
}
