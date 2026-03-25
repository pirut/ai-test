import { LegalArticle } from "@/components/marketing/legal-article";
import { buildMarketingMetadata, siteConfig } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Privacy Policy",
  description: "Privacy policy for Screen.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalArticle
      eyebrow="Privacy"
      title="Privacy Policy"
      description="This policy explains what Screen collects, why it is collected, and how customers can contact us."
    >
      <section>
        <h2 className="text-lg font-semibold text-white">Information collected</h2>
        <p>
          We process account identity, organization membership, billing records, uploaded media
          metadata, device heartbeats, screenshots, and support messages needed to operate the
          hosted service.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Purpose of processing</h2>
        <p>
          Data is used to authenticate users, scope organizations, manage billing, deliver media,
          operate device sync flows, retain operational evidence, and respond to support requests.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Contact</h2>
        <p>
          Privacy requests can be sent to {siteConfig.legalEmail}. Customers should review this
          document with counsel before production use.
        </p>
      </section>
    </LegalArticle>
  );
}
