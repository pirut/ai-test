import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";

import { createRelease, getWorkspaceAccess } from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";
import { isReleaseSigningConfigured, signReleaseChecksum } from "@/lib/release-signing";
import { releaseVersionPattern, sha256Schema } from "@showroom/contracts";

const artifacts = [
  ["playerUrl", "playerSha256", "playerSignature", "player bundle"],
  ["agentUrl", "agentSha256", "agentSignature", "agent"],
  ["systemUrl", "systemSha256", "systemSignature", "system bundle"],
] as const;

const schema = z
  .object({
    name: z.string().trim().min(1, "Give the release a name"),
    version: z
      .string()
      .trim()
      .min(1, "Give the release a version")
      .regex(releaseVersionPattern, "Use only letters, numbers, dots, dashes and underscores"),
    notes: z.string().trim().optional(),
    playerUrl: z.string().url().optional(),
    playerSha256: sha256Schema.optional(),
    playerSignature: z.string().trim().min(1).optional(),
    agentUrl: z.string().url().optional(),
    agentSha256: sha256Schema.optional(),
    agentSignature: z.string().trim().min(1).optional(),
    // A signed RAUC bundle for Showroom OS. It is only ever sent to screens
    // that report the system_bundles capability.
    systemUrl: z.string().url().startsWith("https://", "The system bundle URL must start with https://").optional(),
    systemSha256: sha256Schema.optional(),
    systemSignature: z.string().trim().min(1).optional(),
    // Needed only when signatures are pasted; server-side signing uses the
    // configured key's id.
    signingKeyId: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (!value.playerUrl && !value.agentUrl && !value.systemUrl) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add a player bundle, an agent binary or a system bundle",
        path: ["playerUrl"],
      });
    }
    for (const [urlField, checksumField, , label] of artifacts) {
      if (value[urlField] && !value[checksumField]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Add the SHA-256 of the ${label}`,
          path: [checksumField],
        });
      }
    }
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

  // Check before signing: the platform key must never sign for a workspace
  // that is not allowed to publish.
  const access = await getWorkspaceAccess();
  if (!access.isPlatformOperator) {
    return NextResponse.json(
      { error: "Releases are managed by the platform operator" },
      { status: 403 },
    );
  }

  const release = { ...payload };
  const provided = artifacts.filter(([urlField]) => release[urlField]);
  const unsigned = provided.filter(([, , signatureField]) => !release[signatureField]);
  if (unsigned.length > 0) {
    if (unsigned.length !== provided.length) {
      return NextResponse.json(
        { error: "Paste a signature for every artifact, or leave them all empty to sign here" },
        { status: 400 },
      );
    }
    if (!isReleaseSigningConfigured()) {
      return NextResponse.json(
        {
          error:
            "Paste the Ed25519 signature for each artifact. This dashboard cannot sign because SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY and SHOWROOM_RELEASE_SIGNING_KEY_ID are not set.",
        },
        { status: 400 },
      );
    }
    for (const [, checksumField, signatureField] of unsigned) {
      const signed = signReleaseChecksum(release[checksumField]!);
      release[signatureField] = signed.signature;
      release.signingKeyId = signed.keyId;
    }
  }
  if (!release.signingKeyId) {
    return NextResponse.json(
      { error: "Add the ID of the key that made these signatures" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      release: await createRelease({ ...release, signingKeyId: release.signingKeyId }),
    },
    { status: 201 },
  );
});
