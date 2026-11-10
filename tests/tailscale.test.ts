import assert from "node:assert/strict";
import test from "node:test";

import {
  getTailscaleJoin,
  isTailscaleConfigured,
  readTailscaleConfig,
  removeTailscaleNode,
  tailscaleNodeHostname,
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

test("a removed screen's node is deleted from the tailnet, and only that node", async () => {
  const deleted: string[] = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oauth/token")) {
      return new Response(JSON.stringify({ access_token: "token" }));
    }
    if (url.endsWith("/tailnet/-/devices")) {
      return new Response(
        JSON.stringify({
          devices: [
            { nodeId: "n1", hostname: "showroom-k57ab-c9", tags: ["tag:showroom"] },
            { nodeId: "n2", hostname: "showroom-other", tags: ["tag:showroom"] },
            { nodeId: "n3", hostname: "showroom-k57ab-c9", tags: ["tag:laptop"] },
          ],
        }),
      );
    }
    if (init?.method === "DELETE") {
      deleted.push(url.split("/").pop()!);
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 500 });
  }) as typeof fetch;
  const config = readTailscaleConfig({
    TAILSCALE_OAUTH_CLIENT_ID: "id",
    TAILSCALE_OAUTH_CLIENT_SECRET: "secret",
  });

  assert.equal(tailscaleNodeHostname("K57Ab_c9"), "showroom-k57ab-c9");
  assert.equal(await removeTailscaleNode("K57Ab_c9", config, fakeFetch), "removed");
  assert.deepEqual(deleted, ["n1"]);
  assert.equal(await removeTailscaleNode("unknown", config, fakeFetch), "not_found");
});

test("with only a static auth key the tailnet is left to the screen's own logout", async () => {
  const config = readTailscaleConfig({ TAILSCALE_AUTH_KEY: "static-key" });
  assert.equal(await removeTailscaleNode("abc", config), "skipped");
});
