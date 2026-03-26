import { LegalArticle } from "@/components/marketing/legal-article";
import { buildMarketingMetadata, siteConfig } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Terms of Service",
  description: "Terms of service for Screen.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Terms of Service"
      description="These terms govern access to the hosted Screen control plane and related support services."
    >
      <section>
        <h2 className="text-lg font-semibold text-white">Service scope</h2>
        <p>
          {siteConfig.companyName} provides hosted software for managing digital signage
          devices, media, playlists, schedules, releases, screenshots, and billing. Hardware,
          networking, and on-premise Raspberry Pi operation remain the customer’s responsibility.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Accounts and billing</h2>
        <p>
          Access is scoped by organization. Trials last 14 days and are limited to three claimed
          screens before checkout. Paid plans renew automatically until canceled through the
          billing portal.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Acceptable operation</h2>
        <p>
          Customers may not use the service to distribute unlawful material, abuse rate limits,
          interfere with infrastructure, or bypass plan restrictions.
        </p>
      </section>
    </LegalArticle>
  );
}
