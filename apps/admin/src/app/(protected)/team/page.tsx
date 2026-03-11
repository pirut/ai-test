import { OrganizationList } from "@clerk/nextjs";

import { requireOrgContext } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function TeamPage() {
  const session = await requireOrgContext();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-6">
        <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Access
        </p>
        <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
          Team and organizations
        </h1>
        <p className="mt-1 text-[0.9rem] text-muted-foreground">
          Use Clerk Organizations to scope every screen, playlist, and alert to a single fleet.
        </p>
      </header>

      <div className="max-w-lg flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current session</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-[0.85rem] text-muted-foreground">{session.userId}</p>
          </CardContent>
        </Card>
        <OrganizationList
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
          hideSlug={false}
        />
      </div>
    </div>
  );
}
