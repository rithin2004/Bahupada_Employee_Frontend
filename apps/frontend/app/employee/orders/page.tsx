import { AppShell } from "@/components/layout/app-shell";
import { EmployeeSalesOrdersEditor } from "@/components/modules/employee-sales-orders-editor";

export default function EmployeeOrdersPage() {
  return (
    <AppShell role="employee" activeKey="orders" userName="Employee User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">My Orders</h2>
          <p className="text-sm text-muted-foreground">
            Salesman can create customer sales orders and monitor the current pending order queue.
          </p>
        </div>
        <EmployeeSalesOrdersEditor />
      </div>
    </AppShell>
  );
}
