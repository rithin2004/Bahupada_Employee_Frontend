import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dispatchQueue } from "@/components/dashboard/data";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Ready") return "default";
  if (status === "Packing") return "secondary";
  if (status === "Awaiting Stock") return "destructive";
  return "outline";
}

export function DispatchTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Dispatch Queue</CardTitle>
        <CardDescription>Orders moving through packing and dispatch.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Route</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dispatchQueue.map((row) => (
              <TableRow key={row.invoice}>
                <TableCell className="font-medium">{row.invoice}</TableCell>
                <TableCell>{row.customer}</TableCell>
                <TableCell>{row.route}</TableCell>
                <TableCell>{row.amount}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
