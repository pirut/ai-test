import { httpRouter } from "convex/server";

import { api } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { isUnauthorizedDeviceError, logConvexError } from "./observability";

const http = httpRouter();

function getCredentialFromRequest(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

http.route({
  path: "/api/device/register-temporary",
  method: "POST",
  handler: httpAction(async (ctx) => {
    const payload = await ctx.runMutation(api.device.registerTemporary, {});
    return Response.json(payload, { status: 201 });
  }),
});

http.route({
  path: "/api/device/claim-status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = await request.json();
    const claimStatus = await ctx.runQuery(api.device.getClaimStatus, payload);
    return Response.json(claimStatus);
  }),
});

http.route({
  path: "/api/device/auth/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const credential = getCredentialFromRequest(request);
    if (!credential) {
      return Response.json({ error: "Unauthorized device" }, { status: 401 });
    }

    try {
      const refreshed = await ctx.runMutation(api.device.refreshAuth, { credential });
      return Response.json(refreshed);
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        return Response.json({ error: "Unauthorized device" }, { status: 401 });
      }

      logConvexError("device.auth_refresh.failed", error, {
        path: "/api/device/auth/refresh",
      });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }),
});

http.route({
  path: "/api/device/manifest",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const credential = getCredentialFromRequest(request);
    if (!credential) {
      return Response.json({ error: "Unauthorized device" }, { status: 401 });
    }

    try {
      const manifest = await ctx.runQuery(api.device.getManifest, { credential });
      if (!manifest) {
        return Response.json({ error: "Unauthorized device" }, { status: 401 });
      }

      return Response.json({ manifest });
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        return Response.json({ error: "Unauthorized device" }, { status: 401 });
      }

      logConvexError("device.manifest.failed", error, {
        path: "/api/device/manifest",
      });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }),
});

http.route({
  path: "/api/device/commands",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const credential = getCredentialFromRequest(request);
    if (!credential) {
      return Response.json({ error: "Unauthorized device" }, { status: 401 });
    }

    try {
      const commands = await ctx.runMutation(api.device.claimCommands, { credential });
      return Response.json({ commands });
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        return Response.json({ error: "Unauthorized device" }, { status: 401 });
      }

      logConvexError("device.commands.failed", error, {
        path: "/api/device/commands",
      });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }),
});

http.route({
  path: "/api/device/heartbeat",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const credential = getCredentialFromRequest(request);
    if (!credential) {
      return Response.json({ error: "Unauthorized device" }, { status: 401 });
    }

    const payload = await request.json();
    try {
      const heartbeat = await ctx.runMutation(api.device.recordHeartbeat, {
        credential,
        payload,
      });
      return Response.json({ heartbeat });
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        return Response.json({ error: "Unauthorized device" }, { status: 401 });
      }

      logConvexError("device.heartbeat.failed", error, {
        path: "/api/device/heartbeat",
        payloadDeviceId:
          payload && typeof payload === "object" && "deviceId" in payload
            ? (payload as { deviceId?: unknown }).deviceId
            : undefined,
      });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }),
});

http.route({
  path: "/api/device/command-result",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const credential = getCredentialFromRequest(request);
    if (!credential) {
      return Response.json({ error: "Unauthorized device" }, { status: 401 });
    }

    try {
      const payload = await request.json();
      const result = await ctx.runMutation(api.device.recordCommandResult, {
        credential,
        payload,
      });
      return Response.json({ result });
    } catch (error) {
      if (isUnauthorizedDeviceError(error)) {
        return Response.json({ error: "Unauthorized device" }, { status: 401 });
      }

      logConvexError("device.command_result.failed", error, {
        path: "/api/device/command-result",
      });
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  }),
});

export default http;
