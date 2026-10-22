import { AddScreenDialog } from "@/components/add-screen-dialog";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { type ScreenFilter, ScreensTable } from "@/components/screens-table";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices } from "@/lib/backend";

const filters = new Set<ScreenFilter>(["all", "attention", "online", "stale", "offline", "unclaimed"]);

export default async function ScreensPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; layout?: string }>;
}) {
  const orgId = await requireOrgId();
  const [devices, session, params] = await Promise.all([listDevices(orgId), getAuthSession(), searchParams]);
  const canAdmin = session.has({ role: "org:admin" });
  const requested = (params.view === "attention" ? "attention" : params.status ?? "all") as ScreenFilter;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <PageHeader
        title="Screens"
        description="Every display in this workspace. Open one to see what it's playing, change its settings, or send it a command."
        action={canAdmin ? <AddScreenDialog /> : undefined}
      />
      <ScreensTable
        canAdmin={canAdmin}
        devices={devices}
        initialFilter={filters.has(requested) ? requested : "all"}
        initialLayout={params.layout === "grid" ? "grid" : "list"}
      />
    </div>
  );
}
