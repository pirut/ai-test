import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function LegalArticle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/legal"
          className="inline-flex items-center gap-1.5 text-[0.8rem] text-[#7f8aa6] transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          All legal documents
        </Link>

        <div className="mt-6 text-[0.7rem] uppercase tracking-[0.3em] text-[#9bb6ff]">
          {eyebrow}
        </div>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-white sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-[0.9rem] leading-7 text-[#8d93a6]">
          {description}
        </p>

        <div className="mt-10 space-y-8 text-[0.875rem] leading-7 text-[#b3b9cd] [&_h2]:mb-3 [&_h2]:text-[0.95rem] [&_h2]:font-semibold [&_h2]:text-white [&_section+section]:border-t [&_section+section]:border-white/6 [&_section+section]:pt-8">
          {children}
        </div>
      </div>
    </section>
  );
}
