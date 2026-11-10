import { redirect } from "next/navigation";

import { AddScreenDialog } from "@/components/add-screen-dialog";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { type ScreenFilter, ScreensTable } from "@/components/screens-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices, listPlaylists } from "@/lib/backend";
import { parseClaimCode } from "@/lib/onboarding";

const filters = new Set<ScreenFilter>(["all", "attention", "online", "stale", "offline", "unclaimed"]);

export default async function ScreensPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; view?: string; layout?: string; claim?: string | string[] }>;
}) {
  const params = await searchParams;
  // The QR code on a TV links here with ?claim=CODE.
  const claimCode = parseClaimCode(params.claim);
  // A new account that scanned it names its workspace first and keeps the code.
  const orgId = await requireOrgId(claimCode ? `/welcome?claim=${claimCode}` : undefined);
  const [devices, session, playlists] = await Promise.all([
    listDevices(orgId),
    getAuthSession(),
    // Only used to tell a new screen's owner what happens next.
    listPlaylists().catch(() => null),
  ]);
  const hasDefaultPlaylist = playlists ? playlists.some((playlist) => playlist.isDefault) : undefined;
  const canAdmin = session.has({ role: "org:admin" });
  // A workspace's first screen is paired inside the setup guide, which then
  // carries on to the first video.
  if (claimCode && canAdmin && devices.length === 0) {
    redirect(`/get-started?claim=${claimCode}`);
  }
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
