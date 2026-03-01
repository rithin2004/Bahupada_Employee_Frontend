import { AppShell } from "@/components/layout/app-shell";
import { VendorsAdminEditor } from "@/components/modules/vendors-admin-editor";

export default async function AdminVendorsPage() {
  return (
    <AppShell role="admin" activeKey="vendors" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Vendor Module</h2>
        </div>
        <VendorsAdminEditor />
      </div>
    </AppShell>
  );
}
