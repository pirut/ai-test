import { clerkClient } from "@clerk/nextjs/server";
import { CreateOrganization, OrganizationList } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PublicAuthShell } from "@/components/public-site";
import { isLocalMockMode, requireOrgContext } from "@/lib/auth";
import { parseClaimCode } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Name your workspace" };

// Someone invited to a workspace, or already in one, picks it instead of
// being pushed to create a second one.
async function hasWorkspaceToJoin(userId: string) {
  try {
    const client = await clerkClient();
    const [memberships, invitations] = await Promise.all([
      client.users.getOrganizationMembershipList({ userId, limit: 1 }),
      client.users.getOrganizationInvitationList({ userId, status: "pending", limit: 1 }),
    ]);
    return memberships.data.length > 0 || invitations.data.length > 0;
  } catch {
    // The list also offers "create", so it is the safe view when unsure.
    return true;
  }
}

/**
 * The step between creating an account and the setup guide: every screen,
 * playlist and teammate belongs to a workspace, so a new account names one
 * here. A pairing code scanned from a TV rides along to the guide.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string | string[] }>;
}) {
  const session = await requireOrgContext();
  const claimCode = parseClaimCode((await searchParams).claim);
  const guideUrl = claimCode ? `/get-started?claim=${claimCode}` : "/get-started";
  const existingWorkspaceUrl = claimCode ? `/screens?claim=${claimCode}` : "/dashboard";

  if (isLocalMockMode()) redirect(guideUrl);
  if (session.orgId) redirect(existingWorkspaceUrl);

  const canJoin = await hasWorkspaceToJoin(session.userId!);

  return (
    <PublicAuthShell
      mode="workspace"
      title={canJoin ? "Choose your workspace" : "Name your workspace"}
      description={
        canJoin
          ? "Join a workspace you were invited to, or create a new one for your showroom."
          : claimCode
            ? `A workspace holds your screens, media and team. Use your business name; you can change it later. Next we add the screen showing code ${claimCode}.`
            : "A workspace holds your screens, media and team. Use your business name; you can change it later."
      }
    >
      {canJoin ? (
        <OrganizationList
          afterCreateOrganizationUrl={guideUrl}
          afterSelectOrganizationUrl={existingWorkspaceUrl}
          hidePersonal
          skipInvitationScreen
        />
      ) : (
        <CreateOrganization afterCreateOrganizationUrl={guideUrl} skipInvitationScreen />
      )}
    </PublicAuthShell>
  );
}
