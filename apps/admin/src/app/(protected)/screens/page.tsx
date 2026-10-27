import { AddScreenDialog } from "@/components/add-screen-dialog";
import { PageHeader } from "@/components/page-header";
import { ScreensTable } from "@/components/screens-table";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";

export default async function ScreensPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string | string[] }>;
}) {
  const orgId = await requireOrgId();
  const { claim } = await searchParams;
  // Pairing codes are short and alphanumeric; anything else is ignored.
  const claimCode = typeof claim === "string" && /^[A-Za-z0-9]{4,12}$/.test(claim) ? claim : undefined;
  const [devices, session] = await Promise.all([listDevices(orgId), getAuthSession()]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Screens"
        description="Find a screen, inspect its playback and health, or safely remove it from the fleet."
        action={session.has({ role: "org:admin" }) ? <AddScreenDialog initialClaimCode={claimCode} /> : undefined}
      />
      <ScreensTable initialDevices={devices} canAdmin={session.has({ role: "org:admin" })} />
    </div>
  );
}
