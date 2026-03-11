import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export async function requireOrgContext() {
  const session = await auth();

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

