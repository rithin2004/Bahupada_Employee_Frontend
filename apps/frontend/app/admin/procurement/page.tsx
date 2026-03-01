import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { ProcurementCreateFlow } from "@/components/modules/procurement-create-flow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, fetchBackend } from "@/lib/backend-api";

async function getProcurementData() {
  try {
    const [reorderRes, transferRes, returnsRes] = await Promise.all([
      fetchBackend("/procurement/reorder-logs"),
      fetchBackend("/procurement/warehouse-transfers"),
      fetchBackend("/procurement/purchase-returns"),
    ]);

    return {
      reorders: asArray(reorderRes),
      transfers: asArray(transferRes),
      returns: asArray(returnsRes),
      live: true,
    };
  } catch {
    return { reorders: [], transfers: [], returns: [], live: false };
  }
}

export default async function AdminProcurementPage() {
  const data = await getProcurementData();

  return (
    <AppShell role="admin" activeKey="procurement" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Procurement</h2>
          <p className="text-sm text-muted-foreground">Reorder logs, warehouse movement, and return visibility.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Reorder Logs" value={data.reorders.length} />
          <MetricCard label="Warehouse Transfers" value={data.transfers.length} />
          <MetricCard label="Purchase Returns" value={data.returns.length} />
        </div>

        <ProcurementCreateFlow />

        <Card>
          <CardHeader>
            <CardTitle>Recent Reorder Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Brand</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Grace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.reorders.slice(0, 8).map((row, idx) => (
                  <TableRow key={String(row.id ?? idx)}>
                    <TableCell>{String(row.brand ?? "-")}</TableCell>
                    <TableCell>{String(row.strategy ?? "-")}</TableCell>
                    <TableCell>{String(row.days ?? "-")}</TableCell>
                    <TableCell>{String(row.grace_days ?? "-")}</TableCell>
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
