import { NextResponse } from "next/server";

import { withApiErrors } from "@/lib/api-errors";
import { getAuthSession } from "@/lib/auth";
import { sendTestAlertEmail } from "@/lib/backend";

export const POST = withApiErrors(async function POST() {
  const session = await getAuthSession();
  if (!session.userId || !session.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.has({ role: "org:admin" })) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  return NextResponse.json(await sendTestAlertEmail());
}, "Could not send the test email. Try again.");
