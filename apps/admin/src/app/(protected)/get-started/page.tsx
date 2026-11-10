import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { SetupGuide } from "@/components/setup-guide";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices, listMediaAssets, listPlaylists } from "@/lib/backend";
import { env } from "@/lib/env";
import { type SetupStepId, parseClaimCode, setupProgress, setupStepOrder, toSetupDevice } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Get started" };

// Media offered for a first playlist when the library already has some.
const libraryOfferLimit = 12;

export default async function GetStartedPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; claim?: string | string[]; screen?: string }>;
}) {
  const params = await searchParams;
  const claimCode = parseClaimCode(params.claim);
  // A new account that scanned the TV's QR code names its workspace first.
  const orgId = await requireOrgId(claimCode ? `/welcome?claim=${claimCode}` : undefined);
  const session = await getAuthSession();
  const isAdmin = session.has({ role: "org:admin" });
  // The guide still works if one of these fails to load; it then shows that step as open.
  const [devices, media, playlists] = await Promise.all([
    listDevices(orgId).catch(() => []),
    listMediaAssets().catch(() => []),
    listPlaylists().catch(() => []),
  ]);

  const progress = setupProgress({
    devices: devices.map(toSetupDevice),
    mediaCount: media.length,
    playlists: playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      isDefault: playlist.isDefault,
      items: playlist.items.map((item) => item.id),
    })),
    preferredScreenId: typeof params.screen === "string" ? params.screen : null,
  });
  const initialStep = setupStepOrder.includes(params.step as SetupStepId) ? (params.step as SetupStepId) : undefined;

  return (
    <div className="flex flex-col gap-6">
      {/* Follow the screen closely while it pairs, downloads and starts. */}
      <AutoRefresh intervalMs={progress.complete ? 30_000 : 4_000} />
      <PageHeader
        title={progress.complete ? "You're all set" : "Get started"}
        description={
          progress.complete
            ? "Your first screen is playing. Come back here any time you set up another one."
            : "Four steps from an empty Raspberry Pi to your video playing on a TV. You can leave and pick up where you left off."
        }
      />
      <SetupGuide
        claimCode={claimCode}
        imageUrl={env.imageDownloadUrl}
        initialStep={initialStep}
        isAdmin={isAdmin}
        libraryAssets={media.slice(0, libraryOfferLimit).map((asset) => ({ id: asset.id, title: asset.title }))}
        mediaCount={media.length}
        progress={progress}
      />
    </div>
  );
}
