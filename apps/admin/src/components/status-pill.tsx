import { cn } from "@/lib/utils";

type Status = "online" | "stale" | "offline" | "unclaimed";

const config: Record<Status, { dot: string; text: string; pulse?: boolean }> = {
  online:    { dot: "bg-signal",    text: "text-signal",    pulse: true },
  stale:     { dot: "bg-warning",   text: "text-warning" },
  offline:   { dot: "bg-danger",    text: "text-danger" },
  unclaimed: { dot: "bg-unclaimed", text: "text-unclaimed" },
};

export function StatusPill({ label, status }: { label: string; status: Status }) {
  const c = config[status];
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs font-medium capitalize", c.text)}>
      <span className={cn("size-2 shrink-0 rounded-full", c.dot, c.pulse && "animate-[pulse-dot_2s_ease-in-out_infinite]")} />
      {label}
    </span>
  );
}
