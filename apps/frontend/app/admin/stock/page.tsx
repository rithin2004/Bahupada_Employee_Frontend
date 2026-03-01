import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge } from "@/components/modules/admin-module-ui";
import { StockAdminEditor } from "@/components/modules/stock-admin-editor";

export default function AdminStockPage() {
  return (
    <AppShell role="admin" activeKey="stock" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live />
          <h2 className="text-2xl font-semibold tracking-tight">Stock Module</h2>
          <p className="text-sm text-muted-foreground">Live stock from inventory batches created through challans and billing flows.</p>
        </div>
        <StockAdminEditor />
      </div>
    </AppShell>
  );
}
