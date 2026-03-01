import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

async function getPackingData() {
  try {
    const readyRes = await fetchBackend("/packing/dashboard/ready-to-dispatch?limit=50");
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

export default async function EmployeePackingPage() {
  const data = await getPackingData();

  return (
    <AppShell role="employee" activeKey="packing" userName="Employee User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Packing Tasks</h2>
          <p className="text-sm text-muted-foreground">Tasks ready for dispatch handoff and completion.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Ready Tasks" value={data.count} />
          <MetricCard label="Labeled Packs" value={data.items.filter((item) => Boolean(item.pack_label)).length} />
          <MetricCard
            label="Invoice Marked"
            value={data.items.filter((item) => item.invoice_written_on_pack === true).length}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Packing Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Packing Task</TableHead>
                  <TableHead>Sales Order</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.slice(0, 12).map((item, idx) => (
                  <TableRow key={String(item.packing_task_id ?? idx)}>
                    <TableCell>{String(item.packing_task_id ?? "-")}</TableCell>
                    <TableCell>{String(item.sales_order_id ?? "-")}</TableCell>
                    <TableCell>{String(item.status ?? "-")}</TableCell>
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
