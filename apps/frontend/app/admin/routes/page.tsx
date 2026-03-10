import { AppShell } from "@/components/layout/app-shell";
import { RoutesAdminEditor } from "@/components/modules/routes-admin-editor";

export default function AdminRoutesPage() {
  return (
    <AppShell role="admin" activeKey="routes" userName="Admin User">
      <RoutesAdminEditor />
    </AppShell>
  );
}
