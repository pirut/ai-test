import { PageHeader } from "@/components/page-header";
import { ReleaseManager } from "@/components/release-manager";
import { requireOrgId } from "@/lib/auth";
import { listDevices, listReleases } from "@/lib/backend";

export default async function ReleasesPage() {
  const orgId = await requireOrgId();
  const [devices, releases] = await Promise.all([
    listDevices(orgId),
    listReleases(),
  ]);

  return (
    <>
      <PageHeader
        title="Releases"
        description="Manage player and agent builds, then roll them out across the fleet."
      />
      <div className="p-8">
        <ReleaseManager initialDevices={devices} initialReleases={releases} />
      </div>
    </>
  );
}
