import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { AppShell } from "@/components/layout/app-shell";

export default function EmployeeDashboardPage() {
  return (
    <AppShell role="employee" activeKey="dashboard" userName="Employee User">
      <DashboardHome />
    </AppShell>
  );
}
