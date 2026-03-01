import { AppShell } from "@/components/layout/app-shell";
import { SalesOrdersAdminEditor } from "@/components/modules/sales-orders-admin-editor";

export default function AdminSalesPage() {
  return (
    <AppShell role="admin" activeKey="sales" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Sales Module</h2>
          <p className="text-sm text-muted-foreground">Track and manage sales orders created from customer and admin flows.</p>
        </div>
        <SalesOrdersAdminEditor />
      </div>
    </AppShell>
  );
}
