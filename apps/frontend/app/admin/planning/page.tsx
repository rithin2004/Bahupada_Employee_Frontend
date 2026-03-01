import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

async function getPlanningData() {
  try {
    const [pendingRes, warehousesRes] = await Promise.all([
      fetchBackend("/sales/dashboard/pending-orders?limit=30"),
      fetchBackend("/masters/warehouses?page=1&page_size=1"),
    ]);

    const pending = asObject(pendingRes);
    const pendingItems = asArray(pending.items);

    const warehouse = asArray(asObject(warehousesRes).items)[0];
    let readyItems: Record<string, unknown>[] = [];
    if (warehouse?.id) {
      const readyRes = await fetchBackend(`/delivery/runs/ready-to-dispatch?warehouse_id=${String(warehouse.id)}`);
      readyItems = asArray(asObject(readyRes).items);
    }

    return {
      pendingItems,
      pendingCount: Number(pending.count ?? pendingItems.length),
      readyCount: readyItems.length,
      live: true,
    };
  } catch {
    return { pendingItems: [], pendingCount: 0, readyCount: 0, live: false };
  }
}

export default async function AdminPlanningPage() {
  const data = await getPlanningData();

  return (
    <AppShell role="admin" activeKey="planning" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Planning</h2>
          <p className="text-sm text-muted-foreground">Cross-module planning view using pending sales and dispatch readiness.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Pending Orders" value={data.pendingCount} />
          <MetricCard label="Ready To Dispatch" value={data.readyCount} />
          <MetricCard label="Planning Gap" value={Math.max(data.pendingCount - data.readyCount, 0)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Pending Orders For Planning</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.pendingItems.slice(0, 12).map((item, idx) => (
                  <TableRow key={String(item.sales_order_id ?? idx)}>
                    <TableCell>{String(item.customer_name ?? "-")}</TableCell>
                    <TableCell>{String(item.source ?? "-")}</TableCell>
                    <TableCell>{String(item.status ?? "-")}</TableCell>
                    <TableCell>{String(item.created_at ?? "-")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
