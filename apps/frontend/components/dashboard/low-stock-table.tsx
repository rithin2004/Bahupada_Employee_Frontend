import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardStockAlertItem } from "@/components/dashboard/types";

type LowStockTableProps = {
  items: DashboardStockAlertItem[];
};

function formatQuantity(value: string | number | undefined | null): string {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 4,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function LowStockTable({ items }: LowStockTableProps) {
  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <CardTitle>Stock Attention</CardTitle>
        <CardDescription>Products from the latest reorder snapshot.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Available</TableHead>
                <TableHead>Suggested</TableHead>
                <TableHead>Warehouse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={`${row.product_id}-${row.warehouse_name}`}>
                  <TableCell className="font-medium">{row.sku}</TableCell>
                  <TableCell>{row.product_name}</TableCell>
                  <TableCell>{formatQuantity(row.available_quantity)}</TableCell>
                  <TableCell>{formatQuantity(row.final_qty ?? row.suggested_qty ?? row.reorder_norm_qty)}</TableCell>
                  <TableCell>{row.warehouse_name}</TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    No reorder snapshot available yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
