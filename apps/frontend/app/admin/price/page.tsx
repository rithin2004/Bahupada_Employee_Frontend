import { AppShell } from "@/components/layout/app-shell";
import { PriceAdminEditor } from "@/components/modules/price-admin-editor";

export default async function AdminPricePage() {
  return (
    <AppShell role="admin" activeKey="price" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Price Module</h2>
        </div>
        <PriceAdminEditor />
      </div>
    </AppShell>
  );
}
