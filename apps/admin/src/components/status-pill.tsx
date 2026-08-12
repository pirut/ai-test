import { Badge } from "@/components/ui/badge";

type Status = "online" | "stale" | "offline" | "unclaimed";

const config: Record<Status, { variant: "success" | "warning" | "danger" | "info" }> = {
  online: { variant: "success" },
  stale: { variant: "warning" },
  offline: { variant: "danger" },
  unclaimed: { variant: "info" },
};

export function StatusPill({ label, status }: { label: string; status: Status }) {
  return (
    <Badge variant={config[status].variant}>
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
