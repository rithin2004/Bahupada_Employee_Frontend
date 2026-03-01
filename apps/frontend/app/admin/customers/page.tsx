import { AppShell } from "@/components/layout/app-shell";
import { CustomersAdminEditor } from "@/components/modules/customers-admin-editor";

export default async function AdminCustomersPage() {
  return (
    <AppShell role="admin" activeKey="customers" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Customers Module</h2>
        </div>
        <CustomersAdminEditor />
      </div>
    </AppShell>
  );
}
