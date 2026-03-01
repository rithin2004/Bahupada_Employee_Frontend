import { AppShell } from "@/components/layout/app-shell";
import { SalesInvoicesAdminEditor } from "@/components/modules/sales-invoices-admin-editor";

export default function AdminSalesInvoicesPage() {
  return (
    <AppShell role="admin" activeKey="sales-invoices" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Sales Invoices</h2>
          <p className="text-sm text-muted-foreground">
            Create partial invoices from pending sales orders and review generated sales invoices.
          </p>
        </div>
        <SalesInvoicesAdminEditor />
      </div>
    </AppShell>
  );
}
