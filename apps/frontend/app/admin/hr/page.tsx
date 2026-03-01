import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, fetchBackend } from "@/lib/backend-api";

async function getHrData() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  try {
    const salaryRes = await fetchBackend(`/payroll/salaries?month=${month}&year=${year}`);
    const salaries = asArray(salaryRes);

    return {
      salaries,
      month,
      year,
      live: true,
    };
  } catch {
    return {
      salaries: [],
      month,
      year,
      live: false,
    };
  }
}

export default async function AdminHrPage() {
  const data = await getHrData();
  const paidCount = data.salaries.filter((row) => String(row.paid_status ?? "").toUpperCase() === "PAID").length;

  return (
    <AppShell role="admin" activeKey="hr" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">HR & Payroll</h2>
          <p className="text-sm text-muted-foreground">Salary run visibility for {data.month}/{data.year}.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Salary Records" value={data.salaries.length} />
          <MetricCard label="Paid" value={paidCount} />
          <MetricCard label="Pending" value={data.salaries.length - paidCount} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Salary Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Net Salary</TableHead>
                  <TableHead>Month/Year</TableHead>
                  <TableHead>Paid Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.salaries.slice(0, 12).map((row, idx) => (
                  <TableRow key={String(row.id ?? idx)}>
                    <TableCell>{String(row.employee_id ?? "-")}</TableCell>
                    <TableCell>{String(row.net_salary ?? "0")}</TableCell>
                    <TableCell>{String(row.month ?? "-")}/{String(row.year ?? "-")}</TableCell>
                    <TableCell>{String(row.paid_status ?? "-")}</TableCell>
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
