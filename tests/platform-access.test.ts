import assert from "node:assert/strict";
import test from "node:test";

import { isPlatformOrg, platformOrgIds } from "../convex/lib";

function withPlatformOrgs(value: string | undefined, run: () => void) {
  const previous = process.env.SHOWROOM_PLATFORM_ORG_IDS;
  if (value === undefined) delete process.env.SHOWROOM_PLATFORM_ORG_IDS;
  else process.env.SHOWROOM_PLATFORM_ORG_IDS = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.SHOWROOM_PLATFORM_ORG_IDS;
    else process.env.SHOWROOM_PLATFORM_ORG_IDS = previous;
  }
}

test("every workspace manages releases until platform orgs are configured", () => {
  withPlatformOrgs(undefined, () => {
    assert.equal(platformOrgIds(), null);
    assert.equal(isPlatformOrg("org_customer"), true);
  });
  withPlatformOrgs("  ", () => {
    assert.equal(isPlatformOrg("org_customer"), true);
  });
});

test("only listed workspaces manage releases once configured", () => {
  withPlatformOrgs("org_jr, org_backup", () => {
    assert.equal(isPlatformOrg("org_jr"), true);
    assert.equal(isPlatformOrg("org_backup"), true);
    assert.equal(isPlatformOrg("org_customer"), false);
  });
});
