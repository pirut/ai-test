import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { createRelease } from "@/lib/backend";
import { sha256Schema } from "@showroom/contracts";

const schema = z
  .object({
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    notes: z.string().trim().optional(),
    playerUrl: z.string().url().optional(),
    playerSha256: sha256Schema.optional(),
    playerSignature: z.string().trim().min(1).optional(),
    agentUrl: z.string().url().optional(),
    agentSha256: sha256Schema.optional(),
    agentSignature: z.string().trim().min(1).optional(),
    systemUrl: z.string().url().optional(),
    systemSha256: sha256Schema.optional(),
    systemSignature: z.string().trim().min(1).optional(),
    signingKeyId: z.string().trim().min(1),
  })
  .refine((value) => Boolean(value.playerUrl || value.agentUrl || value.systemUrl), {
    message: "Provide a player URL, agent URL, and/or system bundle URL",
    path: ["playerUrl"],
  })
  .superRefine((value, context) => {
    if (value.systemUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Operating-system updates must use the A/B OTA lane",
        path: ["systemUrl"],
      });
    }
    for (const [urlField, checksumField, signatureField] of [
      ["playerUrl", "playerSha256", "playerSignature"],
      ["agentUrl", "agentSha256", "agentSignature"],
      ["systemUrl", "systemSha256", "systemSignature"],
    ] as const) {
      if (value[urlField] && !value[checksumField]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A SHA-256 checksum is required with ${urlField}`,
          path: [checksumField],
        });
      }
      if (value[urlField] && !value[signatureField]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `An Ed25519 signature is required with ${urlField}`,
          path: [signatureField],
        });
      }
    }
  });

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const payload = schema.parse(await request.json());
  return NextResponse.json(
    {
      release: await createRelease(payload),
    },
    { status: 201 },
  );
}
