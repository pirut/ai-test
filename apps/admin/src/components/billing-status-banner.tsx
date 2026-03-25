import { auth } from "@clerk/nextjs/server";

import { getEntitlementSnapshot } from "@/lib/backend";

export async function BillingStatusBanner() {
  const session = await auth();
  if (!session.orgId) {
    return null;
  }

  const entitlements = await getEntitlementSnapshot(session.orgId);
  if (!entitlements.isReadOnly && !entitlements.isTrialing && !entitlements.cancelAtPeriodEnd) {
    return null;
  }

  const message = entitlements.isReadOnly
    ? "Workspace is read-only until billing is updated."
    : entitlements.cancelAtPeriodEnd
      ? "Subscription is set to cancel at period end."
      : `Trial active until ${new Date(entitlements.trialEndsAt ?? Date.now()).toLocaleDateString()}.`;

  return (
    <div className="rounded-xl border border-[#9bb6ff]/20 bg-[#9bb6ff]/10 px-4 py-3 text-sm text-[#dbe4ff]">
      {message}
    </div>
  );
}
