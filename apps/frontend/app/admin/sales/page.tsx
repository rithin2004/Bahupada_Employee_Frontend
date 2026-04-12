"use client";

import { AppShell } from "@/components/layout/app-shell";
import { SalesCreateFlow } from "@/components/modules/sales-create-flow";

export default function AdminSalesPage() {
  return (
    <AppShell role="admin" activeKey="sales" userName="Admin User">
      <SalesCreateFlow />
    </AppShell>
  );
}
