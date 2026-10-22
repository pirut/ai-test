import { NextResponse } from "next/server";

import {
  getCommandsForCredential,
  getDesiredManifestVersion,
  waitForDeviceSignal,
} from "@/lib/backend";

// Screens long-poll this endpoint: when nothing is queued the request is held
// open until a command arrives or the wait ends, so dashboard commands reach
// the screen within about a second instead of on the next 15-second poll.
// Older agents send no waitSeconds and get an immediate answer as before.
//
// The request also wakes when new content is published to the screen, and the
// response carries that content's manifestVersion. Agents that know the field
// start a sync right away when it differs from what they play; older agents
// ignore it and pick the content up on their next regular sync.
export const maxDuration = 60;
const maxWaitSeconds = 25;

function getDeviceCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

function requestedWaitMs(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("waitSeconds") ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, maxWaitSeconds) * 1000;
}

export async function GET(request: Request) {
  const credential = getDeviceCredentialFromRequest(request);
  let commands = await getCommandsForCredential(credential);
  if (!commands) {
    return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
  }

  const waitMs = requestedWaitMs(request);
  let manifestVersion: string | null | undefined;
  if (commands.length === 0 && waitMs > 0 && credential) {
    manifestVersion = await waitForDeviceSignal(credential, waitMs, request.signal);
    if (request.signal.aborted) {
      // The screen hung up; leave any new command queued for its next request.
      return new NextResponse(null, { status: 499 });
    }
    commands = await getCommandsForCredential(credential);
    if (!commands) {
      return NextResponse.json({ error: "Unauthorized device" }, { status: 401 });
    }
  }
  if (manifestVersion === undefined && waitMs > 0 && credential) {
    // Only long-polling agents use the field. Advisory: a failed lookup must
    // never cost the screen its commands.
    manifestVersion = await getDesiredManifestVersion(credential).catch(() => null);
  }

  return NextResponse.json({ commands, manifestVersion: manifestVersion ?? null });
}
