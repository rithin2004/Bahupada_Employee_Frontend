import { AppShell } from "@/components/layout/app-shell";
import { PlanningAdminEditor } from "@/components/modules/planning-admin-editor";

export default function AdminPlanningPage() {
  return (
    <AppShell role="admin" activeKey="planning" userName="Admin User">
      <div className="w-full min-w-0">
        <PlanningAdminEditor />
      </div>
    </AppShell>
  );
}
