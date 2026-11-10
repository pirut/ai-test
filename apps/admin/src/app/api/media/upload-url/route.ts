import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { acceptedMimeTypes, maxMediaBytes } from "@showroom/contracts";
import { z } from "zod";

import { createUploadDraft } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

const schema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.number().int().positive(),
});

export const POST = withApiErrors(async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());

  if (!acceptedMimeTypes.has(payload.mimeType)) {
    return NextResponse.json({ error: "Unsupported media type" }, { status: 400 });
  }

  if (payload.bytes > maxMediaBytes) {
    return NextResponse.json({ error: "File exceeds 250 MB limit" }, { status: 400 });
  }

  return NextResponse.json({
    upload: await createUploadDraft(payload),
  });
});
