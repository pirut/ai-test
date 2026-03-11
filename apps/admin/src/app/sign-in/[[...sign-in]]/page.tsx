import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">Authentication</p>
          <h1>Configure Clerk</h1>
          <p>
            Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to
            enable the live sign-in flow.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="authShell">
      <SignIn />
    </main>
  );
}

