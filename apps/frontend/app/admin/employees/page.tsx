import { AppShell } from "@/components/layout/app-shell";
import { EmployeesAdminEditor } from "@/components/modules/employees-admin-editor";

export default async function AdminEmployeesPage() {
  return (
    <AppShell role="admin" activeKey="employees" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Employees Module</h2>
        </div>
        <EmployeesAdminEditor />
      </div>
    </AppShell>
  );
}
