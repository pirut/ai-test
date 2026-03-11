import { cn } from "@/lib/utils";

type Status = "online" | "stale" | "offline" | "unclaimed";

const styles: Record<Status, { pill: string; dot: string; animate?: string }> = {
  online:    { pill: "bg-signal/10 text-signal border-signal/20",       dot: "bg-signal",    animate: "animate-[pulse-dot_2s_ease-in-out_infinite]" },
  stale:     { pill: "bg-warning/10 text-warning border-warning/20",     dot: "bg-warning" },
  offline:   { pill: "bg-danger/10 text-danger border-danger/20",        dot: "bg-danger" },
  unclaimed: { pill: "bg-unclaimed/10 text-unclaimed border-unclaimed/20", dot: "bg-unclaimed" },
};

export function StatusPill({ label, status }: { label: string; status: Status }) {
  const s = styles[status];
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
      "text-[0.7rem] font-semibold uppercase tracking-[0.1em] whitespace-nowrap",
      s.pill
    )}>
      <span className={cn("size-1.5 rounded-full flex-shrink-0", s.dot, s.animate)} aria-hidden />
      {label}
    </span>
  );
}
