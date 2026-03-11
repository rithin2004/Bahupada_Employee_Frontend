import { AppShell } from "@/components/layout/app-shell";
import { HsnAdminEditor } from "@/components/modules/hsn-admin-editor";
import { ProductLookupsAdminEditor } from "@/components/modules/product-lookups-admin-editor";
import { ProductsAdminEditor } from "@/components/modules/products-admin-editor";
import { UnitsAdminEditor } from "@/components/modules/units-admin-editor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ProductsTab = "products" | "brands" | "categories" | "sub-categories" | "hsn" | "units";

function resolveTab(tab: string | undefined): ProductsTab {
  if (tab === "hsn" || tab === "units" || tab === "products" || tab === "brands" || tab === "categories" || tab === "sub-categories") {
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
            <TabsTrigger value="brands">Brands</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="sub-categories">Sub Categories</TabsTrigger>
            <TabsTrigger value="hsn">HSN</TabsTrigger>
            <TabsTrigger value="units">Units</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            <ProductsAdminEditor />
          </TabsContent>
          <TabsContent value="brands">
            <ProductLookupsAdminEditor title="Brands" endpoint="/masters/product-brands" entityLabel="Brand" />
          </TabsContent>
          <TabsContent value="categories">
            <ProductLookupsAdminEditor title="Categories" endpoint="/masters/product-categories" entityLabel="Category" />
          </TabsContent>
          <TabsContent value="sub-categories">
            <ProductLookupsAdminEditor
              title="Sub Categories"
              endpoint="/masters/product-sub-categories"
              entityLabel="Sub Category"
              withCategory
            />
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
