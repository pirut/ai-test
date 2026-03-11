import { PageHeader } from "@/components/page-header";
import { requireOrgId } from "@/lib/auth";
import { listSchedules } from "@/lib/backend";

export default async function SchedulesPage() {
  await requireOrgId();
  const schedules = await listSchedules();

  return (
    <>
      <PageHeader
        title="Schedules"
        description="Time-based playlist assignment by priority."
      />
      <div className="p-8">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {schedules.map((window) => (
            <article key={window.id} className="flex flex-col rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.88rem] font-semibold text-card-foreground">{window.label}</p>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[0.7rem] text-muted-foreground">
                    P{window.priority}
                  </span>
                </div>
              </div>
              <div>
                {[
                  { label: "Starts", value: window.startsAt },
                  { label: "Ends",   value: window.endsAt },
                ].map(({ label, value }, i) => (
                  <div key={label} className={`flex items-center justify-between gap-4 px-4 py-2.5 text-sm ${i === 0 ? "border-b border-border" : ""}`}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono text-[0.8rem] text-foreground">{value}</span>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
