import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { AppShell } from "@/components/layout/app-shell";

export default function AdminDashboardPage() {
  return (
    <AppShell role="admin" activeKey="dashboard" userName="Admin User">
      <DashboardHome />
    </AppShell>
  );
}
