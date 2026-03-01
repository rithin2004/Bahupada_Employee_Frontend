import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

const roleMatrix = [
  { role: "Admin", scope: "All Modules", approvals: "Full", users: 3 },
  { role: "Operations Manager", scope: "Sales, Packing, Delivery", approvals: "High", users: 6 },
  { role: "Finance Manager", scope: "Finance, Masters", approvals: "Medium", users: 2 },
  { role: "Warehouse Supervisor", scope: "Stock, Packing", approvals: "Limited", users: 8 },
];

async function getRbacReadiness() {
  try {
    const checksRes = await fetchBackend("/system/go-live-checks");
    const checks = asArray(asObject(checksRes).checks);
    const overallReady = Boolean(asObject(checksRes).overall_ready);

    return {
      checks,
      overallReady,
      live: true,
    };
  } catch {
    return {
      checks: [],
      overallReady: false,
      live: false,
    };
  }
}

export default async function AdminRbacPage() {
  const data = await getRbacReadiness();
  const passingChecks = data.checks.filter((item) => Boolean(item.ok)).length;

  return (
    <AppShell role="admin" activeKey="rbac" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Roles & Permissions</h2>
          <p className="text-sm text-muted-foreground">Role matrix plus live system readiness checks for controlled access operations.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Configured Roles" value={roleMatrix.length} />
          <MetricCard label="Checks Passing" value={`${passingChecks}/${data.checks.length}`} />
          <MetricCard label="Overall Ready" value={data.overallReady ? "Yes" : "No"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Role Matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Approvals</TableHead>
                    <TableHead>Users</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleMatrix.map((row) => (
                    <TableRow key={row.role}>
                      <TableCell>{row.role}</TableCell>
                      <TableCell>{row.scope}</TableCell>
                      <TableCell>{row.approvals}</TableCell>
                      <TableCell>{row.users}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>System Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    <TableHead>OK</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.checks.slice(0, 10).map((item, idx) => (
                    <TableRow key={String(item.name ?? idx)}>
                      <TableCell>{String(item.name ?? "-")}</TableCell>
                      <TableCell>{Boolean(item.ok) ? "Yes" : "No"}</TableCell>
                      <TableCell>{String(item.detail ?? "-")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
