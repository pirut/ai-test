import { NextResponse } from "next/server";
import { z } from "zod";

import { getClaimStatus } from "@/lib/backend";

const schema = z.object({
  deviceSessionId: z.string(),
  claimToken: z.string(),
});

// The screen treats 410 as "this pairing code is dead, request a new one".
const deadSessionPattern = /Unknown registration|Claim session expired|Invalid claim token/i;

export async function POST(request: Request) {
  const payload = schema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid claim status request" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getClaimStatus(payload.data));
  } catch (error) {
    if (error instanceof Error && deadSessionPattern.test(error.message)) {
      return NextResponse.json(
        { error: "Claim session expired", code: "claim_session_expired" },
        { status: 410 },
      );
    }
    throw error;
  }
}
