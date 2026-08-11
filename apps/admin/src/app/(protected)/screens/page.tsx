import { AddScreenDialog } from "@/components/add-screen-dialog";
import { PageHeader } from "@/components/page-header";
import { ScreensTable } from "@/components/screens-table";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";

export default async function ScreensPage() {
  const orgId = await requireOrgId();
  const [devices, session] = await Promise.all([listDevices(orgId), getAuthSession()]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Screens"
        description="Find a screen, inspect its playback and health, or safely remove it from the fleet."
        action={session.has({ role: "org:admin" }) ? <AddScreenDialog /> : undefined}
      />
      <ScreensTable initialDevices={devices} canAdmin={session.has({ role: "org:admin" })} />
    </div>
  );
}
