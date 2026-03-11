import { requireOrgId } from "@/lib/auth";
import { listSchedules } from "@/lib/backend";

export default async function SchedulesPage() {
  await requireOrgId();
  const schedules = await listSchedules();

  return (
    <div>
      <header className="workspaceHeader">
        <div>
          <p className="eyebrow">Dayparting</p>
          <h1>Schedules</h1>
          <p>Compile device-specific manifests whenever scheduling changes.</p>
        </div>
      </header>
      <section className="playlistGrid">
        {schedules.map((window) => (
          <article className="scheduleCard" key={window.id}>
            <span className="eyebrow">Priority {window.priority}</span>
            <strong>{window.label}</strong>
            <p>{window.startsAt}</p>
            <p>{window.endsAt}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
