import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { captureServerError, logStructuredEvent } from "@/lib/observability";
import { siteConfig } from "@/lib/site";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(10),
});

export async function POST(request: Request) {
  if (!env.resendApiKey) {
    return NextResponse.json(
      { error: "Resend is not configured for this deployment." },
      { status: 503 },
    );
  }

  const payload = schema.parse(await request.json());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${siteConfig.name} <onboarding@resend.dev>`,
      to: [siteConfig.salesEmail],
      reply_to: payload.email,
      subject: `New ${siteConfig.name} contact request from ${payload.name}`,
      text: [
        `Name: ${payload.name}`,
        `Email: ${payload.email}`,
        `Company: ${payload.company ?? "n/a"}`,
        "",
        payload.message,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    captureServerError(
      new Error(errorText || "Unable to send contact email."),
      {
        event: "contact.email.failed",
        route: "/api/contact",
        tags: { surface: "marketing" },
        extra: {
          replyTo: payload.email,
        },
      },
    );
    return NextResponse.json(
      { error: errorText || "Unable to send contact email." },
      { status: 502 },
    );
  }

  logStructuredEvent("info", "contact.email.sent", {
    route: "/api/contact",
    replyTo: payload.email,
    company: payload.company ?? null,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
