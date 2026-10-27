import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function PageHeader({
  title,
  description,
  action,
  back,
  meta,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        {back ? (
          <Link
            href={back.href}
            className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            {back.label}
          </Link>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {meta}
        </div>
        {description ? (
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </header>
  );
}
