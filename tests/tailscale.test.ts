import assert from "node:assert/strict";
import test from "node:test";

import {
  getTailscaleJoin,
  isTailscaleConfigured,
  readTailscaleConfig,
} from "../apps/admin/src/lib/tailscale";

test("remote access is off when no Tailscale secret is set", async () => {
  const config = readTailscaleConfig({});
  assert.equal(isTailscaleConfigured(config), false);
  assert.equal(await getTailscaleJoin(config), null);
});

test("a static auth key is handed out with the default tag", async () => {
  const config = readTailscaleConfig({ TAILSCALE_AUTH_KEY: " static-key " });
  assert.deepEqual(await getTailscaleJoin(config), {
    authKey: "static-key",
    tags: ["tag:showroom"],
  });
});

test("custom tags are parsed and invalid ones dropped", () => {
  const config = readTailscaleConfig({ TAILSCALE_DEVICE_TAGS: "tag:screens, nope ,tag:lobby" });
  assert.deepEqual(config.tags, ["tag:screens", "tag:lobby"]);
});

test("an OAuth client mints a single-use pre-approved tagged key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
    }
    return new Response(JSON.stringify({ key: "minted-key" }), { status: 200 });
  }) as typeof fetch;

  const config = readTailscaleConfig({
    TAILSCALE_OAUTH_CLIENT_ID: "client",
    TAILSCALE_OAUTH_CLIENT_SECRET: "secret",
    TAILSCALE_AUTH_KEY: "ignored-when-oauth-is-set",
  });
  const join = await getTailscaleJoin(config, fakeFetch);

  assert.deepEqual(join, { authKey: "minted-key", tags: ["tag:showroom"] });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, "https://api.tailscale.com/api/v2/tailnet/-/keys");
  assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "Bearer token-1");
  const body = JSON.parse(String(calls[1].init?.body));
  assert.deepEqual(body.capabilities.devices.create, {
    reusable: false,
    ephemeral: false,
    preauthorized: true,
    tags: ["tag:showroom"],
  });
});

test("a failed key request surfaces as an error", async () => {
  const fakeFetch = (async () => new Response("nope", { status: 403 })) as unknown as typeof fetch;
  const config = readTailscaleConfig({
    TAILSCALE_OAUTH_CLIENT_ID: "client",
    TAILSCALE_OAUTH_CLIENT_SECRET: "secret",
  });
  await assert.rejects(getTailscaleJoin(config, fakeFetch), /OAuth token request failed \(403\)/);
});
