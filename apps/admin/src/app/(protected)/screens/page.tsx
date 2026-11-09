import { AddScreenDialog } from "@/components/add-screen-dialog";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { type ScreenFilter, ScreensTable } from "@/components/screens-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices, listPlaylists } from "@/lib/backend";

const filters = new Set<ScreenFilter>(["all", "attention", "online", "stale", "offline", "unclaimed"]);

export default async function ScreensPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; layout?: string; claim?: string | string[] }>;
}) {
  const orgId = await requireOrgId();
  const [devices, session, params, playlists] = await Promise.all([
    listDevices(orgId),
    getAuthSession(),
    searchParams,
    // Only used to tell a new screen's owner what happens next.
    listPlaylists().catch(() => null),
  ]);
  const hasDefaultPlaylist = playlists ? playlists.some((playlist) => playlist.isDefault) : undefined;
  const canAdmin = session.has({ role: "org:admin" });
  // Pairing codes are short and alphanumeric; anything else is ignored.
  const claimCode =
    typeof params.claim === "string" && /^[A-Za-z0-9]{4,12}$/.test(params.claim)
      ? params.claim.toUpperCase()
      : undefined;
  const requested = (params.view === "attention" ? "attention" : params.status ?? "all") as ScreenFilter;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh />
      <PageHeader
        title="Screens"
        description="Every display in this workspace. Open one to see what it's playing, change its settings, or send it a command."
        action={
          canAdmin ? (
            <AddScreenDialog hasDefaultPlaylist={hasDefaultPlaylist} initialClaimCode={claimCode} />
          ) : undefined
        }
      />
      {claimCode && !canAdmin ? (
        <Alert>
          <AlertTitle>Ask a workspace admin to add this screen</AlertTitle>
          <AlertDescription>
            Only admins can add screens. Send them the pairing code{" "}
            <span className="font-mono font-semibold text-foreground">{claimCode}</span> from the TV, or have them
            scan it themselves.
          </AlertDescription>
        </Alert>
      ) : null}
      <ScreensTable
        canAdmin={canAdmin}
        devices={devices}
        initialFilter={filters.has(requested) ? requested : "all"}
        initialLayout={params.layout === "grid" ? "grid" : "list"}
      />
    </div>
  );
}
