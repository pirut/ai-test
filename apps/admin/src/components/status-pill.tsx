import { classNames } from "@/lib/utils";

const toneMap = {
  online:    "statusOnline",
  stale:     "statusStale",
  offline:   "statusOffline",
  unclaimed: "statusUnclaimed",
} as const;

export function StatusPill({
  label,
  status,
}: {
  label: string;
  status: keyof typeof toneMap;
}) {
  return (
    <span className={classNames("statusPill", toneMap[status])}>
      <span className="statusDot" aria-hidden="true" />
      {label}
    </span>
  );
}
