export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint: string;
}) {
  return (
    <article className="metricCard">
      <p className="eyebrow">{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </article>
  );
}

