import { OrganizationList } from "@clerk/nextjs";

import { PageHeader } from "@/components/page-header";
import { requireOrgContext } from "@/lib/auth";

export default async function TeamPage() {
  const session = await requireOrgContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team"
        description="Organizations scope all screens, playlists, and alerts."
      />
      <div className="max-w-2xl space-y-5">
        <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session</p>
          <p className="mt-2 font-mono text-sm text-foreground">{session.userId}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-card p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="mb-4">
            <h2 className="font-heading text-xl font-bold text-foreground">Organizations</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Switch the active workspace or create a new organization for another fleet.
            </p>
          </div>
          <OrganizationList
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            hideSlug={false}
          />
        </div>
      </div>
    </div>
  );
}
