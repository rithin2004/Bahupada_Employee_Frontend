import { AppShell } from "@/components/layout/app-shell";
import { HsnAdminEditor } from "@/components/modules/hsn-admin-editor";
import { ProductsAdminEditor } from "@/components/modules/products-admin-editor";
import { UnitsAdminEditor } from "@/components/modules/units-admin-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProductsTab = "products" | "hsn" | "units";

function resolveTab(tab: string | undefined): ProductsTab {
  if (tab === "hsn" || tab === "units" || tab === "products") {
    return tab;
  }
  return "products";
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const tabParam = params?.tab;
  const selectedTab = resolveTab(typeof tabParam === "string" ? tabParam : undefined);

  return (
    <AppShell role="admin" activeKey="products" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Products Module</h2>
          <p className="text-sm text-muted-foreground">Manage and edit product master data synced from inventory dataset.</p>
        </div>
        <Tabs defaultValue={selectedTab} className="w-full">
          <TabsList>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="hsn">HSN</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <ProductsAdminEditor />
          </TabsContent>
          <TabsContent value="hsn">
            <HsnAdminEditor />
          </TabsContent>
          <TabsContent value="units">
            <UnitsAdminEditor />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
