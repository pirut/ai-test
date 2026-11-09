import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { z } from "zod";
import { createHash } from "node:crypto";

import {
  createReleaseArtifactUpload,
  publishReleaseArtifacts,
} from "@/lib/backend";
import { withApiErrors } from "@/lib/api-errors";
import { signReleaseChecksum } from "@/lib/release-signing";

const formSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  deployToAll: z.boolean().default(true),
});

async function sha256ForFile(file: File) {
  const hash = createHash("sha256");
  const reader = file.stream().getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    hash.update(value);
  }
  return hash.digest("hex");
}

async function uploadArtifact(file: File) {
  // The upload URL is only issued to platform operators, so ask for it before signing.
  const upload = await createReleaseArtifactUpload({
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    bytes: file.size,
  });
  const sha256 = await sha256ForFile(file);
  const signed = signReleaseChecksum(sha256);

  const uploadResponse = await fetch(upload.uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Unable to upload ${file.name}`);
  }

  const payload = (await uploadResponse.json()) as { storageId?: string };
  if (!payload.storageId) {
    throw new Error(`Upload for ${file.name} did not return a storageId`);
  }

  return {
    fileName: file.name,
    sha256,
    signature: signed.signature,
    signingKeyId: signed.keyId,
    storageId: payload.storageId,
  };
}

export const POST = withApiErrors(async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const formData = await request.formData();
  const player = formData.get("player");
  const agent = formData.get("agent");
  const system = formData.get("system");

  if (!(player instanceof File) && !(agent instanceof File) && !(system instanceof File)) {
    return NextResponse.json(
      { error: "Provide a player archive, agent binary, and/or system bundle" },
      { status: 400 },
    );
  }

  if (system instanceof File) {
    return NextResponse.json(
      { error: "System bundles are too large to upload here. Host the bundle and add it to a release by URL." },
      { status: 400 },
    );
  }

  const payload = formSchema.parse({
    name: formData.get("name"),
    version: formData.get("version"),
    notes: formData.get("notes") || undefined,
    deployToAll:
      formData.get("deployToAll") == null
        ? true
        : String(formData.get("deployToAll")).toLowerCase() !== "false",
  });

  const [playerArtifact, agentArtifact] = await Promise.all([
    player instanceof File ? uploadArtifact(player) : Promise.resolve(undefined),
    agent instanceof File ? uploadArtifact(agent) : Promise.resolve(undefined),
  ]);

  const result = await publishReleaseArtifacts({
    name: payload.name,
    version: payload.version,
    notes: payload.notes,
    deployToAll: payload.deployToAll,
    player: playerArtifact,
    agent: agentArtifact,
  });

  return NextResponse.json(result, { status: 201 });
});
