import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asObject, fetchBackend } from "@/lib/backend-api";

async function getStockData() {
  try {
    const snapshotRes = asObject(await fetchBackend("/procurement/stock-snapshot?page=1&page_size=20"));
    const rows = Array.isArray(snapshotRes.items) ? snapshotRes.items : [];
    const total = Number(snapshotRes.total ?? 0);
    const available = rows.reduce((acc, row) => {
      const value = Number(asObject(row).available_quantity ?? 0);
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0);
    const reserved = rows.reduce((acc, row) => {
      const value = Number(asObject(row).reserved_quantity ?? 0);
      return acc + (Number.isFinite(value) ? value : 0);
    }, 0);

    return {
      rows: rows.map((row) => asObject(row)),
      total,
      available,
      reserved,
      live: true,
    };
  } catch {
    return { rows: [], total: 0, available: 0, reserved: 0, live: false };
  }
}

export default async function EmployeeStockPage() {
  const data = await getStockData();

  return (
    <AppShell role="employee" activeKey="stock" userName="Employee User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Stock Lookup</h2>
          <p className="text-sm text-muted-foreground">Live inventory batch visibility from warehouse stock movements.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Inventory Batches" value={data.total} />
          <MetricCard label="Available Qty (Page)" value={data.available} />
          <MetricCard label="Reserved Qty (Page)" value={data.reserved} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Batch List</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={6}>
                      No inventory batches found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.rows.map((row, idx) => (
                    <TableRow key={String(row.batch_id ?? idx)}>
                      <TableCell>{String(row.product_name ?? "-")}</TableCell>
                      <TableCell>{String(row.sku ?? "-")}</TableCell>
                      <TableCell>{String(row.batch_no ?? "-")}</TableCell>
                      <TableCell>{String(row.warehouse_name ?? row.warehouse_code ?? "-")}</TableCell>
                      <TableCell>{String(row.unit ?? "-")}</TableCell>
                      <TableCell>{String(row.available_quantity ?? "0")}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
