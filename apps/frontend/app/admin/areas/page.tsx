import { AppShell } from "@/components/layout/app-shell";
import { AreasAdminEditor } from "@/components/modules/areas-admin-editor";

export default function AdminAreasPage() {
  return (
    <AppShell role="admin" activeKey="areas" userName="Admin User">
      <AreasAdminEditor />
    </AppShell>
  );
}
