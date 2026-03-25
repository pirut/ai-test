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
      description="What we collect, why we collect it, and how you can contact us about your data."
    >
      <section>
        <h2>Information we collect</h2>
        <p>
          We process account identity, organization membership, billing records, uploaded media
          metadata, device heartbeats, screenshots, and support messages needed to operate the
          hosted service.
        </p>
      </section>
      <section>
        <h2>Why we process it</h2>
        <p>
          Data is used to authenticate users, scope organizations, manage billing, deliver media,
          operate device sync flows, retain operational evidence, and respond to support requests.
        </p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>
          You can request access to, correction of, or deletion of your personal data at any time
          by contacting {siteConfig.legalEmail}. We will respond within 30 days.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Privacy requests can be sent to{" "}
          <a href={`mailto:${siteConfig.legalEmail}`} className="text-[#9bb6ff] hover:text-white">
            {siteConfig.legalEmail}
          </a>
          .
        </p>
      </section>
    </LegalArticle>
  );
}
