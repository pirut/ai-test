import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { acceptedMimeTypes, maxMediaBytes } from "@showroom/contracts";
import { z } from "zod";

import { finalizeMediaUpload } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";

const schema = z.object({
  title: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.number().int().positive(),
  storagePath: z.string().min(1),
  previewUrl: z.string().url(),
  checksum: z.string().min(1),
  storageId: z.string().min(1).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSeconds: z.number().positive().optional(),
  tags: z.array(z.string()).default([]),
  folderId: z.string().nullable().optional(),
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
  // Same limits as the upload-url step, which a caller could skip.
  if (!acceptedMimeTypes.has(payload.mimeType)) {
    return NextResponse.json({ error: "Unsupported media type" }, { status: 400 });
  }
  if (payload.bytes > maxMediaBytes) {
    return NextResponse.json({ error: "File exceeds 250 MB limit" }, { status: 400 });
  }
  return NextResponse.json(
    {
      asset: await finalizeMediaUpload(payload),
    },
    { status: 201 },
  );
});
