import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { claimDevice } from "@/lib/backend";

const schema = z.object({
  claimCode: z
    .string()
    .trim()
    .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
    .pipe(z.string().length(6, "Claim codes are 6 characters")),
  name: z.string().trim().min(2, "Give the screen a name of at least 2 characters"),
  siteName: z.string().trim().min(2, "Give the site a name of at least 2 characters"),
});

const invalidCodeMessage =
  "That code didn't match a screen waiting to pair. Check the code on the screen; it refreshes automatically if it expired.";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  let result: Awaited<ReturnType<typeof claimDevice>>;
  try {
    result = await claimDevice({ orgId: session.orgId, ...parsed.data });
  } catch (error) {
    if (error instanceof Error && /Invalid claim code/i.test(error.message)) {
      return NextResponse.json({ error: invalidCodeMessage }, { status: 404 });
    }
    throw error;
  }

  if (!result) {
    return NextResponse.json({ error: invalidCodeMessage }, { status: 404 });
  }

  // The device credential is for the screen only; never hand it to the browser.
  return NextResponse.json({ deviceId: result.deviceId }, { status: 201 });
}
