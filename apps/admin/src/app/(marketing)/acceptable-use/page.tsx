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
      description="Use Screen in a way that preserves reliability for every workspace and device fleet."
    >
      <section>
        <h2 className="text-lg font-semibold text-white">Prohibited conduct</h2>
        <p>
          Customers may not upload illegal content, distribute malware, overload the service,
          scrape non-public data, abuse trial flows, or interfere with device APIs.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Operational limits</h2>
        <p>
          Plan limits on screens, storage, and retention are part of the product contract and may
          be enforced automatically through billing and entitlement checks.
        </p>
      </section>
    </LegalArticle>
  );
}
