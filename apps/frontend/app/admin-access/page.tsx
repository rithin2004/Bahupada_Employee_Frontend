import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { AppShell } from "@/components/layout/app-shell";
import { AdminAccessEditor } from "@/components/modules/admin-access-editor";

export default function AdminAccessPage() {
  return (
    <PortalAuthGate portal="ADMIN">
      <AppShell role="admin" activeKey="admin-access" userName="Admin User">
        <AdminAccessEditor />
      </AppShell>
    </PortalAuthGate>
  );
}
