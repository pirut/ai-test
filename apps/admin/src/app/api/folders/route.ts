import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";

import { createLibraryFolder } from "@/lib/backend";

const schema = z.object({
  kind: z.enum(["media", "playlist"]),
  name: z.string().min(1),
  parentId: z.string().nullable().optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());
  return NextResponse.json(
    {
      folder: await createLibraryFolder(payload),
    },
    { status: 201 },
  );
}
