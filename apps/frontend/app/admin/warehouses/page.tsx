import { AppShell } from "@/components/layout/app-shell";
import { RacksAdminEditor } from "@/components/modules/racks-admin-editor";
import { WarehousesAdminEditor } from "@/components/modules/warehouses-admin-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type WarehousesTab = "warehouses" | "racks";

function resolveTab(tab: string | undefined): WarehousesTab {
  if (tab === "warehouses" || tab === "racks") {
    return tab;
  }
  return "warehouses";
}

export default async function AdminWarehousesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const tabParam = params?.tab;
  const selectedTab = resolveTab(typeof tabParam === "string" ? tabParam : undefined);

  return (
    <AppShell role="admin" activeKey="warehouses" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Warehouse Module</h2>
        </div>
        <Tabs defaultValue={selectedTab} className="w-full">
          <TabsList>
            <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
            <TabsTrigger value="racks">Racks</TabsTrigger>
          </TabsList>
          <TabsContent value="warehouses">
            <WarehousesAdminEditor />
          </TabsContent>
          <TabsContent value="racks">
            <RacksAdminEditor />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
