import { AppShell } from "@/components/layout/app-shell";
import { LiveBadge, MetricCard } from "@/components/modules/admin-module-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

async function getFinanceData() {
  try {
    const [trialRes, summaryRes] = await Promise.all([
      fetchBackend("/finance/ledger/trial-balance"),
      fetchBackend("/finance/ledger/summary"),
    ]);

    const trial = asObject(trialRes);
    const accounts = asArray(asObject(summaryRes).items);

    return {
      totalDebit: String(trial.total_debit ?? "0"),
      totalCredit: String(trial.total_credit ?? "0"),
      accounts,
      live: true,
    };
  } catch {
    return { totalDebit: "0", totalCredit: "0", accounts: [], live: false };
  }
}

export default async function AdminFinancePage() {
  const data = await getFinanceData();

  return (
    <AppShell role="admin" activeKey="finance" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <LiveBadge live={data.live} />
          <h2 className="text-2xl font-semibold tracking-tight">Finance</h2>
          <p className="text-sm text-muted-foreground">Ledger balance and account-level net position overview.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <MetricCard label="Total Debit" value={data.totalDebit} />
          <MetricCard label="Total Credit" value={data.totalCredit} />
          <MetricCard label="Accounts" value={data.accounts.length} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ledger Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Debit</TableHead>
                  <TableHead>Credit</TableHead>
                  <TableHead>Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.accounts.slice(0, 12).map((row, idx) => (
                  <TableRow key={String(row.account_name ?? idx)}>
                    <TableCell>{String(row.account_name ?? "-")}</TableCell>
                    <TableCell>{String(row.total_debit ?? "0")}</TableCell>
                    <TableCell>{String(row.total_credit ?? "0")}</TableCell>
                    <TableCell>{String(row.net ?? "0")}</TableCell>
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
