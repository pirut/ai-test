#!/usr/bin/env node

import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const port = Number.parseInt(process.env.SHOWROOM_YOUTUBE_AUTH_HELPER_PORT ?? "4765", 10);
const helperRoot = path.dirname(fileURLToPath(import.meta.url));
const exportScript = path.join(helperRoot, "export-youtube-cookies.sh");
const openUrl = process.env.SHOWROOM_YOUTUBE_AUTH_URL ?? "https://www.youtube.com/account";
const exportTimeoutMs = Number.parseInt(
  process.env.SHOWROOM_YOUTUBE_AUTH_EXPORT_TIMEOUT_MS ?? "30000",
  10,
);
const allowedOriginPatterns = [
  /^https:\/\/screen\.jrbussard\.com$/i,
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https:\/\/.*\.vercel\.app$/i,
];

const browserAppNames = {
  brave: "Brave Browser",
  chrome: "Google Chrome",
  chromium: "Chromium",
  edge: "Microsoft Edge",
  firefox: "Firefox",
  opera: "Opera",
  safari: "Safari",
  vivaldi: "Vivaldi",
  whale: "Whale",
};

function isAllowedOrigin(origin) {
  if (!origin) {
    return false;
  }
  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
}

function writeJson(response, status, payload, origin) {
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(payload));
}

function collectJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function normalizeBrowser(browser) {
  if (!browser || typeof browser !== "string") {
    return "chrome";
  }
  return browser.toLowerCase();
}

function openYouTube(browser) {
  if (process.platform === "darwin") {
    const appName = browserAppNames[browser];
    const args = appName ? ["-a", appName, openUrl] : [openUrl];
    const child = spawn("open", args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return;
  }

  const child = spawn("xdg-open", [openUrl], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

function exportCookies(browser) {
  const workingDirectory = mkdtempSync(path.join(tmpdir(), "showroom-youtube-auth-"));
  const outputPath = path.join(workingDirectory, "youtube.cookies.txt");

  try {
    const result = spawnSync(exportScript, [browser, outputPath], {
      encoding: "utf8",
      env: process.env,
      maxBuffer: 20 * 1024 * 1024,
      timeout: exportTimeoutMs,
    });

    if (result.error) {
      if (result.error.name === "TimeoutError" || result.error.code === "ETIMEDOUT") {
        throw new Error(
          `Cookie export timed out after ${Math.round(exportTimeoutMs / 1000)}s. ` +
            "Unlock the browser profile locally and try again.",
        );
      }
      throw result.error;
    }

    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || result.stdout.trim() || "Cookie export failed");
    }

    const cookies = readFileSync(outputPath, "utf8").trim();
    if (!cookies) {
      throw new Error("Cookie export succeeded, but no YouTube cookies were found");
    }

    return cookies + "\n";
  } finally {
    rmSync(workingDirectory, { force: true, recursive: true });
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  const allowedOrigin = isAllowedOrigin(origin) ? origin : "null";

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Origin": allowedOrigin,
      Vary: "Origin",
    });
    response.end();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    writeJson(response, 403, { error: "Origin not allowed" }, allowedOrigin);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    writeJson(response, 200, { ok: true, openUrl, port }, allowedOrigin);
    return;
  }

  if (request.method === "POST" && request.url === "/youtube/open") {
    try {
      const body = await collectJson(request);
      const browser = normalizeBrowser(body.browser);
      openYouTube(browser);
      writeJson(response, 200, { ok: true, browser, openUrl }, allowedOrigin);
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : "Unable to open YouTube" }, allowedOrigin);
    }
    return;
  }

  if (request.method === "POST" && request.url === "/youtube/export") {
    try {
      const body = await collectJson(request);
      const browser = normalizeBrowser(body.browser);
      const cookies = exportCookies(browser);
      writeJson(response, 200, { ok: true, browser, cookies }, allowedOrigin);
    } catch (error) {
      writeJson(response, 500, { error: error instanceof Error ? error.message : "Unable to export cookies" }, allowedOrigin);
    }
    return;
  }

  writeJson(response, 404, { error: "Not found" }, allowedOrigin);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Showroom YouTube auth helper listening on http://127.0.0.1:${port}\n`);
});
