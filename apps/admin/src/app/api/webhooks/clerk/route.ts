import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";

import {
  deleteOrganizationFromClerkWebhook,
  deleteUserFromClerkWebhook,
  upsertOrganizationFromClerkWebhook,
  upsertUserFromClerkWebhook,
} from "@/lib/backend";

export async function POST(request: Request) {
  const event = await verifyWebhook(request as NextRequest);

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

  return NextResponse.json({ received: true });
}
