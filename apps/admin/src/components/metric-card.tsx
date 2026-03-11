import { cn } from "@/lib/utils";

type Tone = "signal" | "warning" | "danger" | "primary" | "queue" | "unclaimed";

const numberColor: Record<Tone, string> = {
  signal:    "text-signal",
  warning:   "text-warning",
  danger:    "text-danger",
  primary:   "text-primary",
  queue:     "text-queue",
  unclaimed: "text-unclaimed",
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-card px-5 py-4">
      <span className="text-[0.78rem] font-medium text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-[2.2rem] font-semibold leading-none tracking-tight tabular-nums", numberColor[tone])}>
        {value}
      </span>
      <span className="text-[0.78rem] text-muted-foreground/70 leading-snug">{hint}</span>
    </div>
  );
}
