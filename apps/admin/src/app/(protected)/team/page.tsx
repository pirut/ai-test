import { OrganizationList } from "@clerk/nextjs";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isLocalMockMode, requireOrgContext } from "@/lib/auth";

export default async function TeamPage() {
  const session = await requireOrgContext();
  const mockMode = isLocalMockMode();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team"
        description="Each workspace has its own screens, media and playlists. Invite people and manage roles from the workspace menu in the top bar."
      />
      <div className="flex max-w-2xl flex-col gap-6">
        {session.orgId ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Choose a workspace to continue</CardTitle>
              <CardDescription>Pick an existing workspace below, or create one for your showroom.</CardDescription>
            </CardHeader>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Switch the active workspace or create a new one for another location.</CardDescription>
          </CardHeader>
          <CardContent>
            {mockMode ? (
              <p className="text-sm text-muted-foreground">
                Demo workspace. Switching is available when sign-in is enabled.
              </p>
            ) : (
              <OrganizationList
                afterCreateOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                hideSlug={false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
