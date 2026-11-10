import { PageHeader } from "@/components/page-header";
import { ScheduleManager } from "@/components/schedule-manager";
import { ViewOnlyNotice } from "@/components/view-only-notice";
import { getAuthSession, requireOrgId } from "@/lib/auth";
import { listDevices, listPlaylists, listSchedules } from "@/lib/backend";

export default async function SchedulesPage() {
  const orgId = await requireOrgId();
  const [schedules, playlists, devices, session] = await Promise.all([
    listSchedules(),
    listPlaylists(),
    listDevices(orgId),
    getAuthSession(),
  ]);
  const canEdit = session.has({ role: "org:admin" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Schedules"
        description="Play a different playlist at certain times of day, every week or one time. When schedules overlap, the higher priority wins."
      />
      {canEdit ? null : <ViewOnlyNotice what="schedules" />}
      <ScheduleManager
        canEdit={canEdit}
        devices={devices.map((device) => ({
          id: device.id,
          name: device.name,
          // Unpaired screens have no software to update yet.
          supportsRepeatingSchedules: device.status === "unclaimed" ? undefined : Boolean(device.supportsRepeatingSchedules),
        }))}
        initialSchedules={schedules}
        playlists={playlists.map((playlist) => ({ id: playlist.id, name: playlist.name }))}
      />
    </div>
  );
}
