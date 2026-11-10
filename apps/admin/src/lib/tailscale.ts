// Hands screens a Tailscale auth key so they can join the fleet tailnet for
// remote SSH. Configure one of:
//   TAILSCALE_OAUTH_CLIENT_ID + TAILSCALE_OAUTH_CLIENT_SECRET (preferred):
//     each screen gets its own single-use key that expires in minutes.
//   TAILSCALE_AUTH_KEY: a reusable, pre-approved, tagged key handed to every
//     screen. Tailscale caps these at 90 days, so rotate it.
// With neither set the feature is off and screens keep retrying quietly.

const TAILSCALE_API = "https://api.tailscale.com/api/v2";
const DEFAULT_TAGS = ["tag:showroom"];
const MINTED_KEY_EXPIRY_SECONDS = 600;

export type TailscaleConfig = {
  oauthClientId?: string;
  oauthClientSecret?: string;
  authKey?: string;
  tags: string[];
};

export type TailscaleJoin = {
  authKey: string;
  tags: string[];
};

function normalize(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readTailscaleConfig(source: Record<string, string | undefined> = process.env): TailscaleConfig {
  const tags = (source.TAILSCALE_DEVICE_TAGS ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => /^tag:[a-z0-9-]+$/i.test(tag));

  return {
    oauthClientId: normalize(source.TAILSCALE_OAUTH_CLIENT_ID),
    oauthClientSecret: normalize(source.TAILSCALE_OAUTH_CLIENT_SECRET),
    authKey: normalize(source.TAILSCALE_AUTH_KEY),
    tags: tags.length > 0 ? tags : DEFAULT_TAGS,
  };
}

export function isTailscaleConfigured(config: TailscaleConfig) {
  return Boolean((config.oauthClientId && config.oauthClientSecret) || config.authKey);
}

async function oauthAccessToken(config: TailscaleConfig, fetchImpl: typeof fetch) {
  const tokenResponse = await fetchImpl(`${TAILSCALE_API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.oauthClientId!,
      client_secret: config.oauthClientSecret!,
      grant_type: "client_credentials",
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(`Tailscale OAuth token request failed (${tokenResponse.status})`);
  }
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) {
    throw new Error("Tailscale OAuth token response had no access_token");
  }
  return accessToken;
}

async function mintSingleUseKey(config: TailscaleConfig, fetchImpl: typeof fetch) {
  const accessToken = await oauthAccessToken(config, fetchImpl);

  const keyResponse = await fetchImpl(`${TAILSCALE_API}/tailnet/-/keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      capabilities: {
        devices: {
          create: {
            reusable: false,
            ephemeral: false,
            preauthorized: true,
            tags: config.tags,
          },
        },
      },
      expirySeconds: MINTED_KEY_EXPIRY_SECONDS,
      description: "showroom screen",
    }),
  });
  if (!keyResponse.ok) {
    throw new Error(`Tailscale auth key request failed (${keyResponse.status})`);
  }
  const { key } = (await keyResponse.json()) as { key?: string };
  if (!key) {
    throw new Error("Tailscale auth key response had no key");
  }
  return key;
}

export async function getTailscaleJoin(
  config: TailscaleConfig = readTailscaleConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<TailscaleJoin | null> {
  if (config.oauthClientId && config.oauthClientSecret) {
    return { authKey: await mintSingleUseKey(config, fetchImpl), tags: config.tags };
  }
  if (config.authKey) {
    return { authKey: config.authKey, tags: config.tags };
  }
  return null;
}

// The name a screen joins the tailnet under; must match node_hostname in
// infra/pi-image/systemd/showroom-tailscale-join.
export function tailscaleNodeHostname(deviceId: string) {
  return `showroom-${deviceId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 63);
}

// Deletes a removed screen's node from the tailnet so its SSH name stops
// working at once, even if the screen is switched off. Needs the OAuth client
// to have the devices write scope; with only a static auth key there is no API
// access, and the screen logs itself out the next time it is online instead.
// Only a node with the screen's exact name and one of the fleet tags is touched.
export async function removeTailscaleNode(
  deviceId: string,
  config: TailscaleConfig = readTailscaleConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<"removed" | "not_found" | "skipped"> {
  if (!config.oauthClientId || !config.oauthClientSecret) {
    return "skipped";
  }
  const accessToken = await oauthAccessToken(config, fetchImpl);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const listResponse = await fetchImpl(`${TAILSCALE_API}/tailnet/-/devices`, { headers });
  if (!listResponse.ok) {
    throw new Error(`Tailscale device list request failed (${listResponse.status})`);
  }
  const { devices = [] } = (await listResponse.json()) as {
    devices?: Array<{ id?: string; nodeId?: string; hostname?: string; tags?: string[] }>;
  };
  const hostname = tailscaleNodeHostname(deviceId);
  const matches = devices.filter(
    (device) =>
      device.hostname === hostname && (device.tags ?? []).some((tag) => config.tags.includes(tag)),
  );
  if (matches.length === 0) {
    return "not_found";
  }
  for (const device of matches) {
    const id = device.nodeId ?? device.id;
    if (!id) continue;
    const deleteResponse = await fetchImpl(`${TAILSCALE_API}/device/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers,
    });
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      throw new Error(`Tailscale device delete request failed (${deleteResponse.status})`);
    }
  }
  return "removed";
}
