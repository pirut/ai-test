import { createPrivateKey, sign } from "node:crypto";

// Screens only install artifacts whose SHA-256 digest is signed with the
// platform's Ed25519 release key. The private key lives in the dashboard's
// environment only; it is never sent to a browser or a screen.

export class ReleaseSigningNotConfiguredError extends Error {
  constructor() {
    super(
      "Release signing is not configured. Set SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY and SHOWROOM_RELEASE_SIGNING_KEY_ID, or paste a signature.",
    );
    this.name = "ReleaseSigningNotConfiguredError";
  }
}

export function isReleaseSigningConfigured(source: Record<string, string | undefined> = process.env) {
  return Boolean(
    source.SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY?.trim() &&
      source.SHOWROOM_RELEASE_SIGNING_KEY_ID?.trim(),
  );
}

export function signReleaseChecksum(
  sha256: string,
  source: Record<string, string | undefined> = process.env,
) {
  const privateKey = source.SHOWROOM_RELEASE_SIGNING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const keyId = source.SHOWROOM_RELEASE_SIGNING_KEY_ID?.trim();
  if (!privateKey?.trim() || !keyId) {
    throw new ReleaseSigningNotConfiguredError();
  }

  const digest = sha256.trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error("Expected a SHA-256 hex digest");
  }
  const signature = sign(null, Buffer.from(digest, "hex"), createPrivateKey(privateKey));
  return { signature: signature.toString("base64"), keyId };
}
