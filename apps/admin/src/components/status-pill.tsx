import { Badge } from "@/components/ui/badge";
import { type DeviceStatus, statusLabels } from "@/lib/device-health";
import { cn } from "@/lib/utils";

const variants: Record<DeviceStatus, "success" | "warning" | "danger" | "info"> = {
  online: "success",
  stale: "warning",
  offline: "danger",
  unclaimed: "info",
};

/**
 * Screen connection status. `label` overrides the default wording for the
 * few places that reuse the pill for other health states.
 */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: DeviceStatus;
  label?: string;
  className?: string;
}) {
  return (
    <Badge variant={variants[status]} className={className}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full bg-current",
          status === "online" && "motion-safe:animate-[pulse-dot_2s_ease-in-out_infinite]",
        )}
      />
      {label ?? statusLabels[status]}
    </Badge>
  );
}
