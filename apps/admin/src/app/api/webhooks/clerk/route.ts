import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";

import {
  deleteOrganizationFromClerkWebhook,
  deleteUserFromClerkWebhook,
  finalizeExternalWebhookEvent,
  recordExternalWebhookEvent,
  upsertOrganizationFromClerkWebhook,
  upsertUserFromClerkWebhook,
} from "@/lib/backend";
import { logStructuredEvent } from "@/lib/observability";

export async function POST(request: Request) {
  const event = await verifyWebhook(request as NextRequest);
  const eventId = request.headers.get("svix-id") ?? event.type;
  const shouldApply = await recordExternalWebhookEvent({
    provider: "clerk",
    eventId,
    eventType: event.type,
    organizationId:
      event.type.startsWith("organization.")
        ? event.data.id ?? undefined
        : undefined,
  });

  if (!shouldApply) {
    logStructuredEvent("info", "clerk.webhook.deduped", {
      route: "/api/webhooks/clerk",
      eventId,
      eventType: event.type,
    });
    return NextResponse.json({ received: true, deduped: true });
  }

  try {
    switch (event.type) {
      case "organization.created":
      case "organization.updated": {
        await upsertOrganizationFromClerkWebhook({
          clerkOrgId: event.data.id,
          name: event.data.name,
          slug: event.data.slug ?? event.data.id,
          metadata: event.data.public_metadata ?? {},
        });
        break;
      }
      case "organization.deleted": {
        if (event.data.id) {
          await deleteOrganizationFromClerkWebhook({
            clerkOrgId: event.data.id,
          });
        }
        break;
      }
      case "user.created":
      case "user.updated": {
        await upsertUserFromClerkWebhook({
          clerkUserId: event.data.id,
          email: event.data.email_addresses[0]?.email_address ?? "",
          firstName: event.data.first_name ?? undefined,
          lastName: event.data.last_name ?? undefined,
        });
        break;
      }
      case "user.deleted": {
        if (event.data.id) {
          await deleteUserFromClerkWebhook({
            clerkUserId: event.data.id,
          });
        }
        break;
      }
      default:
        break;
    }

    await finalizeExternalWebhookEvent({
      provider: "clerk",
      eventId,
    });

    logStructuredEvent("info", "clerk.webhook.processed", {
      route: "/api/webhooks/clerk",
      eventId,
      eventType: event.type,
    });
  } catch (error) {
    await finalizeExternalWebhookEvent({
      provider: "clerk",
      eventId,
      error: error instanceof Error ? error.message : "Clerk webhook failed",
    });
    throw error;
  }

  return NextResponse.json({ received: true });
}
