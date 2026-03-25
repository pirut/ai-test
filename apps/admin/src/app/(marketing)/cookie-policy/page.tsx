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
      description="How Screen uses cookies and similar technologies."
    >
      <section>
        <h2>Essential cookies only</h2>
        <p>
          Screen uses essential cookies for authentication and billing session management. We do
          not use marketing, analytics, or advertising cookies.
        </p>
      </section>
      <section>
        <h2>What this means</h2>
        <p>
          No cookie consent banner is needed because we only set cookies required for the service
          to function. Your browsing is not tracked for advertising purposes.
        </p>
      </section>
      <section>
        <h2>Future changes</h2>
        <p>
          If we add analytics or non-essential cookies in the future, this policy will be updated
          and a consent mechanism will be implemented at the same time.
        </p>
      </section>
    </LegalArticle>
  );
}
