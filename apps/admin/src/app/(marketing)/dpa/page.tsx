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
      description="This DPA describes how customer data is handled when Screen acts as a processor for hosted workspace data."
    >
      <section>
        <h2 className="text-lg font-semibold text-white">Customer instructions</h2>
        <p>
          Screen processes customer data to provide the hosted control plane, device management,
          media library, screenshots, schedules, and billing support described in the service terms.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Security measures</h2>
        <p>
          The service uses organization scoping, signed uploads, authenticated device credentials,
          billing webhook verification, and retention controls to reduce exposure of customer data.
        </p>
      </section>
      <section>
        <h2 className="text-lg font-semibold text-white">Subprocessors</h2>
        <p>
          Current operational subprocessors align to the deployed stack: Vercel, Convex, Clerk,
          Stripe, Resend, UploadThing, and Sentry.
        </p>
      </section>
    </LegalArticle>
  );
}
