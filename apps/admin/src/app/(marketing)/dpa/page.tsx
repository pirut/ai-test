import { LegalArticle } from "@/components/marketing/legal-article";
import { buildMarketingMetadata } from "@/lib/site";

export const metadata = buildMarketingMetadata({
  title: "Data Processing Addendum",
  description: "Data processing addendum for Screen.",
  path: "/dpa",
});

export default function DpaPage() {
  return (
    <LegalArticle
      eyebrow="Legal"
      title="Data Processing Addendum"
      description="How we handle your data when acting as a processor for your workspace."
    >
      <section>
        <h2>Processing scope</h2>
        <p>
          Screen processes customer data to provide the hosted control plane, device management,
          media library, screenshots, schedules, and billing support described in the Terms of
          Service.
        </p>
      </section>
      <section>
        <h2>Security measures</h2>
        <p>
          The service uses organization scoping, signed uploads, authenticated device credentials,
          webhook signature verification, and configurable retention controls to protect customer
          data.
        </p>
      </section>
      <section>
        <h2>Subprocessors</h2>
        <p>
          Current subprocessors: Vercel (hosting), Convex (database), Clerk (auth), Stripe
          (billing), Resend (email), UploadThing (file storage), and Sentry (error monitoring).
        </p>
      </section>
      <section>
        <h2>Data deletion</h2>
        <p>
          Upon termination, customer data is retained in read-only mode for 30 days, then
          permanently deleted from all systems including backups within 90 days.
        </p>
      </section>
    </LegalArticle>
  );
}
