import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

async function getPlanningData() {
  try {
    const pendingRes = await fetchBackend("/sales/dashboard/pending-orders?limit=30");
    const pending = asObject(pendingRes);
    const items = asArray(pending.items);

    return {
      count: Number(pending.count ?? items.length),
      items,
      live: true,
    };
  } catch {
    return { count: 0, items: [], live: false };
  }
}

export default async function EmployeePlanningPage() {
  const data = await getPlanningData();

  return (
    <AppShell role="employee" activeKey="calendar" userName="Employee User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Duty Calendar</h2>
          <p className="text-sm text-muted-foreground">Planning snapshot from currently pending operational orders.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Planning Items" value={data.count} />
          <MetricCard label="Visible Rows" value={data.items.length} />
          <MetricCard
            label="Customer Spread"
            value={new Set(data.items.map((item) => String(item.customer_id ?? ""))).size}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Planned Order Workload</CardTitle>
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
                {data.items.slice(0, 12).map((item, idx) => (
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
