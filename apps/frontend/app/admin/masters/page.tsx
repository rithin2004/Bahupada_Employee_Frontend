import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { MastersCreatePanel } from "@/components/modules/masters-create-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

async function getMastersData() {
  try {
    const [productsRes, customersRes, warehousesRes] = await Promise.all([
      fetchBackend("/masters/products?page=1&page_size=6"),
      fetchBackend("/masters/customers?page=1&page_size=6"),
      fetchBackend("/masters/warehouses?page=1&page_size=6"),
    ]);

    const [areasRes, routesRes] = await Promise.all([
      fetchBackend("/masters/areas").catch(() => null),
      fetchBackend("/masters/routes").catch(() => null),
    ]);

    return {
      products: asArray(asObject(productsRes).items),
      customers: asArray(asObject(customersRes).items),
      warehouses: asArray(asObject(warehousesRes).items),
      areasCount: areasRes ? asArray(areasRes).length : "n/a",
      routesCount: routesRes ? asArray(routesRes).length : "n/a",
      totals: {
        products: Number(asObject(productsRes).total ?? 0),
        customers: Number(asObject(customersRes).total ?? 0),
        warehouses: Number(asObject(warehousesRes).total ?? 0),
      },
      live: true,
    };
  } catch {
    return {
      products: [],
      customers: [],
      warehouses: [],
      areasCount: "n/a",
      routesCount: "n/a",
      totals: { products: 0, customers: 0, warehouses: 0 },
      live: false,
    };
  }
}

export default async function AdminMastersPage() {
  const data = await getMastersData();

  return (
    <AppShell role="admin" activeKey="masters" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Masters</h2>
          <p className="text-sm text-muted-foreground">Product, customer, and warehouse records for operational accuracy.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard label="Products" value={data.totals.products} />
          <MetricCard label="Customers" value={data.totals.customers} />
          <MetricCard label="Warehouses" value={data.totals.warehouses} />
          <MetricCard label="Areas" value={data.areasCount} />
          <MetricCard label="Routes" value={data.routesCount} />
        </div>

        <MastersCreatePanel />

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Products</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Brand</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.products.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>{String(row.name ?? "-")}</TableCell>
                      <TableCell>{String(row.sku ?? "-")}</TableCell>
                      <TableCell>{String(row.brand ?? "-")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Class</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.customers.map((row) => (
                    <TableRow key={String(row.id)}>
                      <TableCell>{String(row.name ?? "-")}</TableCell>
                      <TableCell>{String(row.outlet_name ?? "-")}</TableCell>
                      <TableCell>{String(row.customer_class ?? "-")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
