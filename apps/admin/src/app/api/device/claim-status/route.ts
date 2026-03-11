import { NextResponse } from "next/server";
import { z } from "zod";

import { getClaimStatus } from "@/lib/backend";

const schema = z.object({
  deviceSessionId: z.string(),
  claimToken: z.string(),
});

export async function POST(request: Request) {
  const payload = schema.parse(await request.json());
  return NextResponse.json(await getClaimStatus(payload));
}
