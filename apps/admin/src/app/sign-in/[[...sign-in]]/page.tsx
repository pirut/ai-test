import { auth } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import { redirect } from "next/navigation";

import { PublicAuthShell } from "@/components/marketing/public-auth-shell";

export default async function SignInPage() {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const session = await auth();

    if (session.userId) {
      redirect(session.orgId ? "/dashboard" : "/team");
    }
  }

  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <PublicAuthShell
        mode="sign-in"
        title="Configure Clerk"
        description="Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY to enable the live sign-in flow."
      >
        <div className="rounded-[22px] bg-[#131313] p-5 text-sm leading-7 text-[#c2c6d6]">
          Clerk is not configured in this environment yet. Once the keys are present,
          this panel will render the live authentication flow.
        </div>
      </PublicAuthShell>
    );
  }

  return (
    <PublicAuthShell
      mode="sign-in"
      title="Enter your workspace"
      description="Open the operator console, switch organizations, and continue into the screen fleet."
    >
      <SignIn />
    </PublicAuthShell>
  );
}
