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
    <section className="px-6 py-20">
      <div className="mx-auto max-w-4xl">
        <div className="text-[11px] uppercase tracking-[0.3em] text-[#9bb6ff]">{eyebrow}</div>
        <h1 className="mt-4 text-4xl font-black tracking-[-0.04em] text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-[#c5cad8]">{description}</p>
        <div className="mt-12 space-y-8 rounded-[28px] border border-white/8 bg-[#11151b] p-8 text-sm leading-7 text-[#d6daea]">
          {children}
        </div>
      </div>
    </section>
  );
}
