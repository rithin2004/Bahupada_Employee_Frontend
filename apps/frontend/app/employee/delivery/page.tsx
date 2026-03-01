import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

async function getDeliveryData() {
  try {
    const warehousesRes = await fetchBackend("/masters/warehouses?page=1&page_size=1");
    const warehouse = asArray(asObject(warehousesRes).items)[0];

    if (!warehouse?.id) {
      return { count: 0, items: [], live: false };
    }

    const readyRes = await fetchBackend(`/delivery/runs/ready-to-dispatch?warehouse_id=${String(warehouse.id)}`);
    const ready = asObject(readyRes);
    const items = asArray(ready.items);

    return {
      count: Number(ready.count ?? items.length),
      items,
      live: true,
    };
  } catch {
    return { count: 0, items: [], live: false };
  }
}

export default async function EmployeeDeliveryPage() {
  const data = await getDeliveryData();

  return (
    <AppShell role="employee" activeKey="delivery" userName="Employee User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Delivery Runs</h2>
          <p className="text-sm text-muted-foreground">Dispatch candidates and route preparation workload.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Dispatch Items" value={data.count} />
          <MetricCard label="With Pack Label" value={data.items.filter((item) => Boolean(item.pack_label)).length} />
          <MetricCard label="Displayed" value={data.items.length} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Delivery Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packing Task</TableHead>
                  <TableHead>Sales Order</TableHead>
                  <TableHead>Pack Label</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.slice(0, 12).map((item, idx) => (
                  <TableRow key={String(item.packing_task_id ?? idx)}>
                    <TableCell>{String(item.packing_task_id ?? "-")}</TableCell>
                    <TableCell>{String(item.sales_order_id ?? "-")}</TableCell>
                    <TableCell>{String(item.pack_label ?? "-")}</TableCell>
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
