import Link from "next/link";

import { CustomerPortalButton } from "@/components/marketing/customer-portal-button";
import { PricingShowcase } from "@/components/marketing/pricing-showcase";
import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { getBillingAccount, getEntitlementSnapshot } from "@/lib/backend";

export default async function BillingPage() {
  const orgId = await requireOrgId();
  const [billingAccount, entitlements] = await Promise.all([
    getBillingAccount(orgId),
    getEntitlementSnapshot(orgId),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Billing"
        description="Manage trial status, plan limits, and Stripe billing from inside the workspace."
        action={<CustomerPortalButton />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ["Plan", billingAccount.planKey],
              ["Status", billingAccount.subscriptionStatus],
              ["Active screens", String(entitlements.activeScreenCount)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
                <div className="mt-3 text-lg font-semibold text-foreground">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Trial / period end
              </div>
              <div className="mt-3 text-sm text-foreground">
                {billingAccount.currentPeriodEnd ??
                  billingAccount.trialEndsAt ??
                  "Unavailable"}
              </div>
            </div>
            <div className="rounded-xl border border-white/6 bg-[var(--surface-low)] p-4">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Billing email
              </div>
              <div className="mt-3 text-sm text-foreground">
                {billingAccount.billingEmail ?? "Set during checkout"}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-white/6 bg-[var(--surface-low)] p-4 text-sm leading-7 text-muted-foreground">
            Trial workspaces can claim up to {entitlements.trialDeviceLimit} screens before
            checkout. Read-only mode blocks new uploads, claims, schedule changes, and releases
            until billing is active again.
          </div>

          {billingAccount.subscriptionStatus !== "active" ? (
            <div className="mt-5 rounded-xl border border-white/6 bg-[var(--surface-low)] p-4 text-sm leading-7 text-muted-foreground">
              Monthly and annual plans are available in the catalog below.
              <Link href="#plan-options" className="ml-2 text-primary hover:underline">
                Review plan options
              </Link>
            </div>
          ) : null}
        </section>

        <aside className="space-y-5">
          <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Current limits</div>
            <div className="mt-4 space-y-3 text-sm text-foreground">
              <div>Included screens: {entitlements.includedScreens}</div>
              <div>Extra screen price: ${(entitlements.extraScreenPriceCents / 100).toFixed(0)}/mo</div>
              <div>Storage limit: {(entitlements.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0)} GB</div>
              <div>Screenshot retention: {entitlements.screenshotRetentionDays} days</div>
            </div>
          </div>
        </aside>
      </div>

      <section id="plan-options">
        <PageHeader
          title="Plan options"
          description="Upgrade or downgrade from the same transparent SaaS catalog used on the marketing site."
        />
        <div className="mt-5">
          <PricingShowcase />
        </div>
      </section>
    </div>
  );
}
