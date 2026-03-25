import { BillingStatusBanner } from "@/components/billing-status-banner";
import { TopShell } from "@/components/top-shell";
import { requireOrgContext } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOrgContext();
  return (
    <TopShell>
      <BillingStatusBanner />
      {children}
    </TopShell>
  );
}
