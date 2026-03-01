import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DispatchTable } from "@/components/dashboard/dispatch-table";
import { LowStockTable } from "@/components/dashboard/low-stock-table";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { PlanningOverview } from "@/components/dashboard/planning-overview";

export function DashboardHome() {
  return (
    <div className="space-y-6">
      <MetricsGrid />

      <Tabs defaultValue="dispatch" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dispatch">Dispatch Queue</TabsTrigger>
          <TabsTrigger value="stock">Low Stock</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
        </TabsList>

        <TabsContent value="dispatch">
          <DispatchTable />
        </TabsContent>

        <TabsContent value="stock">
          <LowStockTable />
        </TabsContent>

        <TabsContent value="planning">
          <PlanningOverview />
        </TabsContent>
      </Tabs>
    </div>
  );
}
