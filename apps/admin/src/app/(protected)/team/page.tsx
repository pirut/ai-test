import { OrganizationList } from "@clerk/nextjs";

import { PageHeader } from "@/components/page-header";
import { isLocalMockMode, requireOrgContext } from "@/lib/auth";

export default async function TeamPage() {
  const session = await requireOrgContext();
  const mockMode = isLocalMockMode();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Organizations scope all screens, playlists, and alerts."
      />
      <div className="max-w-2xl space-y-5">
        <div className="dashboard-surface rounded-lg p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session</p>
          <p className="mt-2 font-mono text-sm text-foreground">{session.userId}</p>
        </div>
        <div className="dashboard-surface rounded-lg p-5">
          <div className="mb-4">
            <h2 className="font-heading text-xl font-bold text-foreground">Organizations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch the active workspace or create a new organization for another fleet.
            </p>
          </div>
          {mockMode ? (
            <div className="rounded-md border border-border bg-[var(--surface-low)] px-4 py-3">
              <p className="text-sm font-medium text-foreground">Demo workspace</p>
              <p className="mt-1 text-xs text-muted-foreground">Organization switching is available when Clerk authentication is enabled.</p>
            </div>
          ) : (
            <OrganizationList
              afterCreateOrganizationUrl="/dashboard"
              afterSelectOrganizationUrl="/dashboard"
              hideSlug={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
