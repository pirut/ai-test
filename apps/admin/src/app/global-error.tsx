"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#0a0d10] text-white">
        <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-start justify-center px-6 py-16">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[#9bb6ff]">
            Screen
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.04em]">
            The app hit an unexpected error.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-white/70">
            The failure has been captured for investigation. Retry the request, and if the
            issue persists, use the contact page from the public site.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-8 inline-flex h-11 items-center justify-center rounded-xl border border-white/12 px-4 text-sm font-medium text-white transition-colors hover:bg-white/5"
          >
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
