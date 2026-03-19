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
    <div className="rounded-xl border border-white/5 bg-card px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", numberColor[tone])}>
          {hint}
        </span>
      </div>
      <span className={cn("font-heading mt-4 block text-[2.4rem] font-extrabold leading-none tracking-[-0.04em] tabular-nums", numberColor[tone])}>
        {value}
      </span>
    </div>
  );
}
