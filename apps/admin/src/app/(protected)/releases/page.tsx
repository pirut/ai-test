import { PageHeader } from "@/components/page-header";
import { ReleaseManager } from "@/components/release-manager";
import { requireOrgId } from "@/lib/auth";
import { getWorkspaceAccess, listDevices, listReleases } from "@/lib/backend";

export default async function ReleasesPage() {
  const orgId = await requireOrgId();
  const access = await getWorkspaceAccess();
  if (!access.isPlatformOperator) {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Releases"
          description="Player and agent updates are published by the platform and reach your screens automatically."
        />
      </div>
    );
  }
  const [devices, releases] = await Promise.all([
    listDevices(orgId),
    listReleases(),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Releases"
        description="Manage player and agent builds, then roll them out across the fleet."
      />
      <ReleaseManager initialDevices={devices} initialReleases={releases} />
    </div>
  );
}
