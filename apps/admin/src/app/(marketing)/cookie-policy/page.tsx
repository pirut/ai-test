import { LegalArticle } from "@/components/marketing/legal-article";
import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Cookie Policy",
  description: "Cookie policy for Screen.",
  path: "/cookie-policy",
});

export default function CookiePolicyPage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Cookie Policy"
      description="This policy explains the current cookie posture for the Screen website and app."
    >
      <section>
        <h2 className="text-lg font-semibold text-white">Current use</h2>
        <p>
          At launch, Screen uses essential cookies for authentication and billing flows. The
          product intentionally avoids a marketing-cookie banner in v1 by not shipping non-essential
          tracking cookies.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Future changes</h2>
        <p>
          If analytics or advertising cookies are added later, this policy and the consent
          behavior will be updated at the same time.
        </p>
      </section>
    </LegalArticle>
  );
}
