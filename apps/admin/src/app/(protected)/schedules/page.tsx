import { PageHeader } from "@/components/page-header";
import { ScheduleManager } from "@/components/schedule-manager";
import { requireOrgId } from "@/lib/auth";
import { listDevices, listPlaylists, listSchedules } from "@/lib/backend";

export default async function SchedulesPage() {
  const orgId = await requireOrgId();
  const [schedules, playlists, devices] = await Promise.all([
    listSchedules(),
    listPlaylists(),
    listDevices(orgId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedules"
        description="Play a different playlist at certain times. When windows overlap, the higher priority wins."
      />
      <ScheduleManager
        devices={devices.map((device) => ({ id: device.id, name: device.name }))}
        initialSchedules={schedules}
        playlists={playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }))}
      />
    </div>
  );
}
