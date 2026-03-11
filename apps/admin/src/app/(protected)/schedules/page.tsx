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
    <>
      <PageHeader
        title="Schedules"
        description="Time-based playlist assignment by priority."
      />
      <div className="p-8">
        <ScheduleManager
          devices={devices.map((device) => ({ id: device.id, name: device.name }))}
          initialSchedules={schedules}
          playlists={playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }))}
        />
      </div>
    </>
  );
}
