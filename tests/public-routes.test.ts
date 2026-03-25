import assert from "node:assert/strict";
import test from "node:test";

import robots from "../apps/admin/src/app/robots";
import sitemap from "../apps/admin/src/app/sitemap";

test("sitemap includes the new public SaaS pages", () => {
  const entries = sitemap().map((entry) => new URL(entry.url).pathname);

  for (const path of ["/pricing", "/security", "/getting-started", "/contact", "/legal"]) {
    assert.ok(entries.includes(path), `expected ${path} in sitemap`);
  }
});

test("robots allows public marketing pages and disallows protected app pages", () => {
  const rules = robots().rules;
  assert.ok(Array.isArray(rules));

  const userAgentRule = rules[0];
  if (!userAgentRule || Array.isArray(userAgentRule)) {
    throw new Error("Expected a single robots rule entry");
  }

  assert.ok(userAgentRule.allow?.includes("/pricing"));
  assert.ok(userAgentRule.allow?.includes("/privacy"));
  assert.ok(userAgentRule.disallow?.includes("/dashboard"));
  assert.ok(userAgentRule.disallow?.includes("/billing"));
});
