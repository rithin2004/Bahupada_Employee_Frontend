import { AppShell } from "@/components/layout/app-shell";
import { ProcurementCreateFlow } from "@/components/modules/procurement-create-flow";

export default function AdminPurchasePage() {
  return (
    <AppShell role="admin" activeKey="purchase" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Purchase Module</h2>
          <p className="text-sm text-muted-foreground">Create purchase challan with vendor, warehouse, and selected product items.</p>
        </div>
        <ProcurementCreateFlow />
      </div>
    </AppShell>
  );
}
