import { classNames } from "@/lib/utils";

type Tone = "signal" | "warning" | "danger" | "accent" | "queue" | "unclaimed";

const toneClass: Record<Tone, string> = {
  signal:    "metricToneSignal",
  warning:   "metricToneWarning",
  danger:    "metricToneDanger",
  accent:    "metricToneAccent",
  queue:     "metricToneQueue",
  unclaimed: "metricToneUnclaimed",
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "accent",
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: Tone;
}) {
  return (
    <article className={classNames("metricCard", toneClass[tone])}>
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}
