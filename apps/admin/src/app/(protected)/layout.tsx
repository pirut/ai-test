import { TopShell } from "@/components/top-shell";
import { isLocalMockMode, requireOrgContext } from "@/lib/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireOrgContext();
  return <TopShell authEnabled={!isLocalMockMode()}>{children}</TopShell>;
}
