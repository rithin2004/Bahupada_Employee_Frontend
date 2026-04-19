import { AppShell } from "@/components/layout/app-shell";
import { PartyLedgerAdminEditor } from "@/components/modules/party-ledger-admin-editor";

export default function AdminCreditDebitNotesPage() {
  return (
    <AppShell role="admin" activeKey="credit-debit-notes" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Accounting Module</h2>
          <p className="text-sm text-muted-foreground">
            Vendor payables, customer receivables, and self accounts: ledger statements and payments (including purchase bill links)
            from one place.
          </p>
        </div>
        <PartyLedgerAdminEditor />
      </div>
    </AppShell>
  );
}
