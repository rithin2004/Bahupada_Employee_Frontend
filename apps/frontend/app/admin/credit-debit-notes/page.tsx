import { AppShell } from "@/components/layout/app-shell";
import { PartyLedgerAdminEditor } from "@/components/modules/party-ledger-admin-editor";

export default function AdminCreditDebitNotesPage() {
  return (
    <AppShell role="admin" activeKey="credit-debit-notes" userName="Admin User">
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">Credit Debit Notes</h2>
          <p className="text-sm text-muted-foreground">
            Vendor payables and customer receivables are tracked as chronological ledger accounts from the admin point of view.
          </p>
        </div>
        <PartyLedgerAdminEditor />
      </div>
    </AppShell>
  );
}
