import { OrganizationList, OrganizationProfile } from "@clerk/nextjs";

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
        description="Each workspace has its own screens, media and playlists. Admins can add screens and change content. Members can see everything, sync a screen, and turn its display on or off."
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
        {session.orgId && !mockMode ? (
          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
              <CardDescription>Invite teammates and choose who is an admin.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <OrganizationProfile routing="hash" />
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Switch the active workspace or create a new one for another location.</CardDescription>
          </CardHeader>
          <CardContent>
            {mockMode ? (
              <p className="text-sm text-muted-foreground">
                Demo workspace. Inviting people and switching workspaces are available when sign-in is enabled.
              </p>
            ) : (
              <OrganizationList
                afterCreateOrganizationUrl="/get-started"
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
