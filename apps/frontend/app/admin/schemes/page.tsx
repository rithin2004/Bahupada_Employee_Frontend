import { AppShell } from "@/components/layout/app-shell";
import { SchemesAdminEditor } from "@/components/modules/schemes-admin-editor";

export default function AdminSchemesPage() {
  return (
    <AppShell role="admin" activeKey="schemes" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Schemes Module</h2>
          <p className="text-sm text-muted-foreground">
            Create customer-category-specific free-item or discount schemes using value, weight, or quantity thresholds.
          </p>
        </div>
        <SchemesAdminEditor />
      </div>
    </AppShell>
  );
}
