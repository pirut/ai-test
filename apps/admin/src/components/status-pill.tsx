import { cn } from "@/lib/utils";

type Status = "online" | "stale" | "offline" | "unclaimed";

const config: Record<Status, { dot: string; text: string; bg: string; pulse?: boolean }> = {
  online:    { dot: "bg-signal",    text: "text-signal",    bg: "bg-signal/10",    pulse: true },
  stale:     { dot: "bg-warning",   text: "text-warning",   bg: "bg-warning/10" },
  offline:   { dot: "bg-danger",    text: "text-danger",    bg: "bg-danger/10" },
  unclaimed: { dot: "bg-unclaimed", text: "text-unclaimed", bg: "bg-unclaimed/10" },
};

export function StatusPill({ label, status }: { label: string; status: Status }) {
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full border border-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]", c.bg, c.text)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", c.dot, c.pulse && "animate-[pulse-dot_2s_ease-in-out_infinite]")} />
      {label}
    </span>
  );
}
