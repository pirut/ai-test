import { OrganizationList } from "@clerk/nextjs";

import { requireOrgContext } from "@/lib/auth";

export default async function TeamPage() {
  const session = await requireOrgContext();

  return (
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Access</p>
          <h1>Team and organizations</h1>
          <p>
            Use Clerk Organizations to scope every screen, playlist, and alert
            to a single fleet.
          </p>
        </div>
      </header>
      <section className="panel teamPanel">
        <p>Signed in as {session.userId}</p>
        <OrganizationList
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
          hideSlug={false}
        />
      </section>
    </div>
  );
}

