import { PublicFooter } from "@/components/marketing/public-footer";
import { PublicNav } from "@/components/marketing/public-nav";

export function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#0c0e11] text-[#f5f7fd] selection:bg-[#90adff]/30">
      <PublicNav />
      {children}
      <PublicFooter />
    </main>
  );
}
