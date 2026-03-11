import { OrganizationList } from "@clerk/nextjs";

import { PageHeader } from "@/components/page-header";
import { requireOrgContext } from "@/lib/auth";

export default async function TeamPage() {
  const session = await requireOrgContext();

  return (
    <>
      <PageHeader
        title="Team"
        description="Organizations scope all screens, playlists, and alerts."
      />
      <div className="p-8">
        <div className="max-w-lg flex flex-col gap-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="mb-1 text-[0.75rem] font-medium text-muted-foreground uppercase tracking-wider">Session</p>
            <p className="font-mono text-sm text-foreground">{session.userId}</p>
          </div>
          <OrganizationList
            afterCreateOrganizationUrl="/dashboard"
            afterSelectOrganizationUrl="/dashboard"
            hideSlug={false}
          />
        </div>
      </div>
    </>
  );
}
