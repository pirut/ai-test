import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";

export function isLocalMockMode() {
  return process.env.NODE_ENV !== "production" && env.isMockMode;
}

const localMockSession = {
  userId: "mock-user",
  orgId: "org-demo",
  // SHOWROOM_MOCK_ROLE=member previews the dashboard as a view-only member.
  has: ({ role }: { role?: string }) =>
    role === "org:member" ||
    (role === "org:admin" && (process.env.SHOWROOM_MOCK_ROLE ?? "").toLowerCase() !== "member"),
  getToken: async () => null,
};

export async function getAuthSession() {
  if (isLocalMockMode()) return localMockSession;
  return auth();
}

export async function requireOrgContext() {
  const session = await getAuthSession();

  if (!session.userId) {
    redirect("/sign-in");
  }

  return session;
}

/** Where an account with no workspace yet is sent to name one. */
export const noWorkspaceUrl = "/welcome";

export async function requireOrgId(noWorkspaceRedirect = noWorkspaceUrl) {
  const session = await requireOrgContext();

  if (!session.orgId) {
    redirect(noWorkspaceRedirect);
  }

  return session.orgId;
}

export async function requireOrgAdmin() {
  const session = await requireOrgContext();

  if (!session.orgId) {
    redirect(noWorkspaceUrl);
  }

  if (!session.has({ role: "org:admin" })) {
    redirect("/dashboard");
  }

  return session;
}
