import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lowStock } from "@/components/dashboard/data";

export function LowStockTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reorder Attention</CardTitle>
        <CardDescription>Products below threshold based on reorder policy.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Reorder Level</TableHead>
              <TableHead>Warehouse</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lowStock.map((row) => (
              <TableRow key={row.sku}>
                <TableCell className="font-medium">{row.sku}</TableCell>
                <TableCell>{row.product}</TableCell>
                <TableCell>{row.stock}</TableCell>
                <TableCell>{row.reorder}</TableCell>
                <TableCell>{row.warehouse}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
