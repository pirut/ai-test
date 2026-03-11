import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

type Tone = "signal" | "warning" | "danger" | "brand" | "queue" | "unclaimed";

const toneStyles: Record<Tone, { bar: string; number: string }> = {
  signal:    { bar: "bg-signal",    number: "text-signal" },
  warning:   { bar: "bg-warning",   number: "text-warning" },
  danger:    { bar: "bg-danger",    number: "text-danger" },
  brand:     { bar: "bg-brand",     number: "text-brand" },
  queue:     { bar: "bg-queue",     number: "text-queue" },
  unclaimed: { bar: "bg-unclaimed", number: "text-unclaimed" },
};

export function MetricCard({
  label,
  value,
  hint,
  tone = "brand",
}: {
  label: string;
  value: string | number;
  hint: string;
  tone?: Tone;
}) {
  return (
    <Card className="relative overflow-hidden gap-2 py-5">
      {/* Colored top accent strip */}
      <span className={cn("absolute inset-x-0 top-0 h-0.5", toneStyles[tone].bar)} />
      <CardContent className="flex flex-col gap-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-brand">
          {label}
        </p>
        <strong className={cn("font-mono text-4xl font-semibold tracking-tight leading-none", toneStyles[tone].number)}>
          {value}
        </strong>
        <span className="text-[0.8rem] text-muted-foreground leading-snug">{hint}</span>
      </CardContent>
    </Card>
  );
}
