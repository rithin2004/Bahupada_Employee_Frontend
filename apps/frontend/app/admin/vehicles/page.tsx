import { AppShell } from "@/components/layout/app-shell";
import { VehiclesAdminEditor } from "@/components/modules/vehicles-admin-editor";

export default function AdminVehiclesPage() {
  return (
    <AppShell role="admin" activeKey="vehicles" userName="Admin User">
      <VehiclesAdminEditor />
    </AppShell>
  );
}
