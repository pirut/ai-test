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
          description="Software updates for your screens are published by Digital Curator. There is nothing to do here."
        />
      </div>
    );
  }
  const [devices, releases] = await Promise.all([
    listDevices(orgId),
    listReleases(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Releases"
        description="Signed software updates for your screens. Roll out to a few screens first, then the rest."
      />
      <ReleaseManager
        initialDevices={devices}
        initialReleases={releases}
        canDeployToAllWorkspaces={access.canDeployToAllWorkspaces}
      />
    </div>
  );
}
