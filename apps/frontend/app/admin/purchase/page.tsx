import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { AppShell } from "@/components/layout/app-shell";
import { PurchaseEntryWorkspace } from "@/components/modules/purchase-entry-workspace";
import { ProcurementCreateFlow } from "@/components/modules/procurement-create-flow";

export default function AdminPurchasePage() {
  return (
    <PortalAuthGate portal="ADMIN">
      <AppShell role="admin" activeKey="purchase" userName="Admin User">
        <div className="space-y-3">
          <PurchaseEntryWorkspace />
          <details className="rounded-2xl border bg-card px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-semibold tracking-[0.08em] text-muted-foreground">
              Legacy Challan And Old Purchase Flow
            </summary>
            <div className="mt-4">
              <ProcurementCreateFlow />
            </div>
          </details>
        </div>
      </AppShell>
    </PortalAuthGate>
  );
}
