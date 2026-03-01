import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Loading() {
  return (
    <AppShell role="employee" activeKey="stock" userName="Employee User">
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-80 max-w-full" />
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
                {Array.from({ length: 10 }).map((_, row) => (
                  <TableRow key={row}>
                    <TableCell><Skeleton className="h-9 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-9 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-9 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-9 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-9 w-full" /></TableCell>
                    <TableCell><Skeleton className="h-9 w-full" /></TableCell>
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
