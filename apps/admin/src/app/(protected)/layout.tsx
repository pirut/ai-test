import { TopShell } from "@/components/top-shell";
import { isLocalMockMode, requireOrgContext } from "@/lib/auth";
import { getWorkspaceAccess, listDevices } from "@/lib/backend";
import { countByStatus, needsAttention } from "@/lib/device-health";

async function loadFleetPulse(orgId: string) {
  try {
    const devices = await listDevices(orgId);
    const counts = countByStatus(devices);
    return {
      total: devices.length,
      online: counts.online,
      attention: devices.filter(needsAttention).length,
    };
  } catch {
    // The shell must still render if the fleet query fails; pages surface their own errors.
    return null;
  }
}

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireOrgContext();
  const [pulse, access] = await Promise.all([
    session.orgId ? loadFleetPulse(session.orgId) : null,
    session.orgId
      ? getWorkspaceAccess().catch(() => ({ isPlatformOperator: true }))
      : { isPlatformOperator: false },
  ]);
  return (
    <TopShell
      authEnabled={!isLocalMockMode()}
      fleetPulse={pulse}
      showReleases={access.isPlatformOperator}
    >
      {children}
    </TopShell>
  );
}
