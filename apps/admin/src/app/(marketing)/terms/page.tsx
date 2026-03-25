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
      description="These terms govern your use of the Screen platform and related services."
    >
      <section>
        <h2>Service scope</h2>
        <p>
          {siteConfig.companyName} provides hosted software for managing digital signage
          devices, media, playlists, schedules, releases, screenshots, and billing. Hardware,
          networking, and on-premise Raspberry Pi operation remain your responsibility.
        </p>
      </section>
      <section>
        <h2>Accounts and billing</h2>
        <p>
          Access is scoped by organization. Trials last 14 days and include up to three claimed
          screens. Paid plans renew automatically until canceled through the billing portal.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          You may not use the service to distribute unlawful material, abuse rate limits,
          interfere with infrastructure, or bypass plan restrictions. See the full{" "}
          <a href="/acceptable-use" className="text-[#9bb6ff] hover:text-white">
            Acceptable Use Policy
          </a>{" "}
          for details.
        </p>
      </section>
      <section>
        <h2>Termination</h2>
        <p>
          Either party may terminate at any time. On cancellation, your workspace enters
          read-only mode and existing content continues playing for 30 days.
        </p>
      </section>
    </LegalArticle>
  );
}
