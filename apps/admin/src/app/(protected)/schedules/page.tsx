import { requireOrgId } from "@/lib/auth";
import { listSchedules } from "@/lib/backend";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SchedulesPage() {
  await requireOrgId();
  const schedules = await listSchedules();

  return (
    <div className="flex flex-col gap-8">
      <header className="border-b border-border pb-6">
        <p className="mb-1 flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          <span className="inline-block h-px w-4 bg-brand opacity-70" />
          Dayparting
        </p>
        <h1 className="text-[clamp(1.6rem,2.5vw,2.2rem)] font-semibold tracking-tight leading-tight">
          Schedules
        </h1>
        <p className="mt-1 text-[0.9rem] text-muted-foreground">
          Compile device-specific manifests whenever scheduling changes.
        </p>
      </header>

      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
        {schedules.map((window) => (
          <Card key={window.id}>
            <CardHeader>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
                Priority {window.priority}
              </p>
              <CardTitle>{window.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-border">
                <div className="flex items-center justify-between py-2 text-[0.85rem]">
                  <span className="text-muted-foreground">Starts</span>
                  <strong className="font-mono text-[0.82rem]">{window.startsAt}</strong>
                </div>
                <div className="flex items-center justify-between py-2 text-[0.85rem]">
                  <span className="text-muted-foreground">Ends</span>
                  <strong className="font-mono text-[0.82rem]">{window.endsAt}</strong>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
