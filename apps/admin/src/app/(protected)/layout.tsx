import { TopShell } from "@/components/top-shell";
import { isLocalMockMode, requireOrgContext } from "@/lib/auth";
import { getWorkspaceAccess } from "@/lib/backend";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireOrgContext();
  const access = session.orgId
    ? await getWorkspaceAccess().catch(() => ({ isPlatformOperator: true }))
    : { isPlatformOperator: false };
  return (
    <TopShell authEnabled={!isLocalMockMode()} showReleases={access.isPlatformOperator}>
      {children}
    </TopShell>
  );
}
