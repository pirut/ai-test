import { LegalArticle } from "@/components/marketing/legal-article";
import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Acceptable Use Policy",
  description: "Acceptable use policy for Screen.",
  path: "/acceptable-use",
});

export default function AcceptableUsePage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Acceptable Use Policy"
      description="Guidelines for using Screen responsibly."
    >
      <section>
        <h2>Prohibited conduct</h2>
        <p>
          You may not upload illegal content, distribute malware, overload the service, scrape
          non-public data, abuse trial flows, or interfere with device APIs.
        </p>
      </section>
      <section>
        <h2>Plan limits</h2>
        <p>
          Limits on screens, storage, and retention are part of your plan and are enforced
          automatically. Attempting to circumvent these limits may result in account suspension.
        </p>
      </section>
      <section>
        <h2>Enforcement</h2>
        <p>
          We reserve the right to suspend or terminate accounts that violate this policy. We will
          make reasonable efforts to notify you before taking action, except in urgent cases.
        </p>
      </section>
    </LegalArticle>
  );
}
