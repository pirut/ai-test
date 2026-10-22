import { Badge } from "@/components/ui/badge";
import { type CommandStatus, commandStatusLabels } from "@/lib/commands";

const variants: Record<CommandStatus, "secondary" | "info" | "success" | "danger"> = {
  queued: "secondary",
  in_progress: "info",
  succeeded: "success",
  failed: "danger",
};

export function CommandStatusBadge({ status }: { status?: CommandStatus | null }) {
  const resolved = status ?? "queued";
  return <Badge variant={variants[resolved]}>{commandStatusLabels[resolved]}</Badge>;
}
