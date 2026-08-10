import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";

export function isLocalMockMode() {
  return process.env.NODE_ENV !== "production" && env.isMockMode;
}

const localMockSession = {
  userId: "mock-user",
  orgId: "org-demo",
  has: ({ role }: { role?: string }) => role === "org:admin" || role === "org:member",
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

export async function requireOrgId() {
  const session = await requireOrgContext();

  if (!session.orgId) {
    redirect("/team");
  }

  return session.orgId;
}

export async function requireOrgAdmin() {
  const session = await requireOrgContext();

  if (!session.orgId) {
    redirect("/team");
  }

  if (!session.has({ role: "org:admin" })) {
    redirect("/dashboard");
  }

  return session;
}
