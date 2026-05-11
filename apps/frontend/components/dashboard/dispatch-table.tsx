import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardDispatchItem } from "@/components/dashboard/types";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = status.replace(/\s+/g, "_").toUpperCase();
  if (normalized === "READY_TO_DISPATCH") return "default";
  if (normalized === "IN_PROGRESS" || normalized === "ASSIGNED" || normalized === "PENDING") return "secondary";
  if (normalized.includes("STOCK") || normalized.includes("SHORT")) return "destructive";
  return "outline";
}

type DispatchTableProps = {
  items: DashboardDispatchItem[];
};

function formatCurrency(value: string | number | undefined | null): string {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function DispatchTable({ items }: DispatchTableProps) {
  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <CardTitle>Pending Dispatch Queue</CardTitle>
        <CardDescription>Orders waiting to enter packing.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Route</TableHead>
                <TableHead>Warehouse</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.invoice_number ?? row.sales_order_id}>
                  <TableCell className="font-medium">{row.invoice_number ?? row.sales_order_id.slice(0, 10)}</TableCell>
                  <TableCell>{row.customer_name}</TableCell>
                  <TableCell>{row.route_name ?? "-"}</TableCell>
                  <TableCell>{row.warehouse_name ?? "-"}</TableCell>
                  <TableCell>{formatCurrency(row.amount)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No pending orders right now.
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
