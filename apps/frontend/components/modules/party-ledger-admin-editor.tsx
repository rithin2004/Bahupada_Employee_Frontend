"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, fetchPortalMe, postBackend } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PurchaseBillRefWizard } from "@/components/modules/purchase-bill-ref-wizard";
import { SalesInvoiceRefWizard } from "@/components/modules/sales-invoice-ref-wizard";

type LedgerTab = "VENDOR" | "CUSTOMER" | "SELF";

type AccountRow = {
  account_id: string;
  party_type: string;
  party_id: string;
  party_name: string;
  account_category_id: string;
  account_category_name: string;
  total_debit: string;
  total_credit: string;
  balance: string;
  balance_side: string;
};

type StatementRow = {
  entry_id: string;
  entry_date: string;
  description: string;
  reference_type: string;
  admin_debit: string;
  admin_credit: string;
  counterparty_debit: string;
  counterparty_credit: string;
  running_balance: string;
  balance_side: string;
};

type StatementPayload = {
  account_id: string;
  party_type: string;
  party_id: string;
  party_name: string;
  items: StatementRow[];
  total_debit: string;
  total_credit: string;
  balance: string;
  balance_side: string;
};

type SelfAccountRow = {
  id: string;
  name: string;
  account_type: string;
  opening_balance: string;
  opening_balance_side: string;
  opening_balance_date: string;
  note: string;
  is_active: boolean;
};

type PurchaseBillRow = {
  id: string;
  bill_number: string;
  bill_date: string;
  vendor_id: string;
  total_amount: string;
};

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return value;
  }
  return d.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

function formatAmount(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

export function PartyLedgerAdminEditor() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadLedger, setCanReadLedger] = useState(false);
  const [canWriteLedger, setCanWriteLedger] = useState(false);
  const [tab, setTab] = useState<LedgerTab>("VENDOR");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountsFeedback, setAccountsFeedback] = useState("");
  const [selectedAccount, setSelectedAccount] = useState<AccountRow | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statement, setStatement] = useState<StatementPayload | null>(null);
  const [statementFeedback, setStatementFeedback] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [selfAccounts, setSelfAccounts] = useState<SelfAccountRow[]>([]);
  const [selectedSelfAccountId, setSelectedSelfAccountId] = useState("");
  const [vendorBills, setVendorBills] = useState<PurchaseBillRow[]>([]);
  const [billAllocations, setBillAllocations] = useState<Record<string, string>>({});
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [postingPayment, setPostingPayment] = useState(false);
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [openSelfAccountDialog, setOpenSelfAccountDialog] = useState(false);
  const [vendorPaymentWizardOpen, setVendorPaymentWizardOpen] = useState(false);
  const [customerReceiptWizardOpen, setCustomerReceiptWizardOpen] = useState(false);
  const [creatingSelfAccount, setCreatingSelfAccount] = useState(false);
  const [selfAccountName, setSelfAccountName] = useState("");
  const [selfAccountType, setSelfAccountType] = useState("");
  const [selfAccountOpeningBalance, setSelfAccountOpeningBalance] = useState("");
  const [selfAccountOpeningSide, setSelfAccountOpeningSide] = useState("DR");
  const [selfAccountOpeningDate, setSelfAccountOpeningDate] = useState("");
  const [selfAccountNote, setSelfAccountNote] = useState("");

  const loadAccounts = useCallback(async (kind: Exclude<LedgerTab, "SELF">, term: string) => {
    if (!canReadLedger) {
      setAccountsLoading(false);
      setAccounts([]);
      return;
    }
    setAccountsLoading(true);
    setAccountsFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("party_type", kind);
      params.set("page", "1");
      params.set("page_size", "100");
      if (term.trim()) {
        params.set("search", term.trim());
      }
      const response = asObject(await fetchBackend(`/finance/party-ledger/accounts?${params.toString()}`));
      const rows = asArray(response.items).map((row) => ({
        account_id: String(row.account_id ?? ""),
        party_type: String(row.party_type ?? kind),
        party_id: String(row.party_id ?? ""),
        party_name: String(row.party_name ?? "-"),
        account_category_id: String(row.account_category_id ?? ""),
        account_category_name: String(row.account_category_name ?? ""),
        total_debit: String(row.total_debit ?? "0"),
        total_credit: String(row.total_credit ?? "0"),
        balance: String(row.balance ?? "0"),
        balance_side: String(row.balance_side ?? "-"),
      }));
      setAccounts(rows);
      setSelectedAccount((prev) => {
        const retained = prev ? rows.find((row) => row.account_id === prev.account_id) ?? null : null;
        return retained ?? rows[0] ?? null;
      });
    } catch (error) {
      setAccounts([]);
      setSelectedAccount(null);
      setAccountsFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setAccountsLoading(false);
    }
  }, [canReadLedger]);

  const loadStatement = useCallback(async (account: AccountRow | null) => {
    if (!canReadLedger) {
      setStatement(null);
      setStatementFeedback("");
      return;
    }
    if (!account) {
      setStatement(null);
      setStatementFeedback("");
      return;
    }
    setStatementLoading(true);
    setStatementFeedback("");
    try {
      const payload = asObject(await fetchBackend(`/finance/party-ledger/${account.party_type.toLowerCase()}/${account.party_id}`));
      setStatement({
        account_id: String(payload.account_id ?? ""),
        party_type: String(payload.party_type ?? account.party_type),
        party_id: String(payload.party_id ?? account.party_id),
        party_name: String(payload.party_name ?? account.party_name),
        items: asArray(payload.items).map((row) => ({
          entry_id: String(row.entry_id ?? ""),
          entry_date: String(row.entry_date ?? ""),
          description: String(row.description ?? "-"),
          reference_type: String(row.reference_type ?? "-"),
          admin_debit: String(row.admin_debit ?? "0"),
          admin_credit: String(row.admin_credit ?? "0"),
          counterparty_debit: String(row.counterparty_debit ?? "0"),
          counterparty_credit: String(row.counterparty_credit ?? "0"),
          running_balance: String(row.running_balance ?? "0"),
          balance_side: String(row.balance_side ?? "-"),
        })),
        total_debit: String(payload.total_debit ?? "0"),
        total_credit: String(payload.total_credit ?? "0"),
        balance: String(payload.balance ?? "0"),
        balance_side: String(payload.balance_side ?? "-"),
      });
    } catch (error) {
      setStatement(null);
      setStatementFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setStatementLoading(false);
    }
  }, [canReadLedger]);

  const loadSelfAccounts = useCallback(async () => {
    if (!canReadLedger) {
      setSelfAccounts([]);
      return;
    }
    try {
      const rows = asArray(await fetchBackend("/finance/self-accounts")).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? "-"),
        account_type: String(row.account_type ?? ""),
        opening_balance: String(row.opening_balance ?? "0"),
        opening_balance_side: String(row.opening_balance_side ?? "DR"),
        opening_balance_date: String(row.opening_balance_date ?? ""),
        note: String(row.note ?? ""),
        is_active: Boolean(row.is_active),
      }));
      setSelfAccounts(rows);
      setSelectedSelfAccountId((prev) => (prev && rows.some((row) => row.id === prev) ? prev : rows[0]?.id ?? ""));
    } catch {
      setSelfAccounts([]);
      setSelectedSelfAccountId("");
    }
  }, [canReadLedger]);

  const loadVendorBills = useCallback(async (vendorId: string) => {
    if (!vendorId) {
      setVendorBills([]);
      return;
    }
    try {
      const rows = asArray(await fetchBackend("/procurement/purchase-bills"))
        .map((row) => ({
          id: String(row.id ?? ""),
          bill_number: String(row.bill_number ?? ""),
          bill_date: String(row.bill_date ?? ""),
          vendor_id: String(row.vendor_id ?? ""),
          total_amount: String(row.total_amount ?? "0"),
        }))
        .filter((row) => row.vendor_id === vendorId);
      setVendorBills(rows);
    } catch {
      setVendorBills([]);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = asObject(await fetchPortalMe());
        const isSuperAdmin = Boolean(payload.is_super_admin);
        const permission = asObject(asObject(payload.admin_permissions)["credit-debit-notes"]);
        if (!active) {
          return;
        }
        setCanReadLedger(isSuperAdmin || Boolean(permission.read) || Boolean(permission.write));
        setCanWriteLedger(isSuperAdmin || Boolean(permission.write));
        setPermissionsLoaded(true);
      } catch {
        if (!active) {
          return;
        }
        setCanReadLedger(false);
        setCanWriteLedger(false);
        setPermissionsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!permissionsLoaded || !canReadLedger) {
      setAccountsLoading(false);
      return;
    }
    if (tab === "SELF") {
      setAccountsLoading(false);
      void loadSelfAccounts();
      setSelectedAccount(null);
      return;
    }
    void loadAccounts(tab, search);
  }, [permissionsLoaded, canReadLedger, search, tab, loadAccounts, loadSelfAccounts]);

  useEffect(() => {
    if (tab === "SELF") {
      if (selectedSelfAccountId) {
        void (async () => {
          setStatementLoading(true);
          setStatementFeedback("");
          try {
            const payload = asObject(await fetchBackend(`/finance/self-accounts/${selectedSelfAccountId}/statement`));
            setStatement({
              account_id: String(payload.account_id ?? ""),
              party_type: "SELF",
              party_id: String(payload.party_id ?? ""),
              party_name: String(payload.party_name ?? ""),
              items: asArray(payload.items).map((row) => ({
                entry_id: String(row.entry_id ?? ""),
                entry_date: String(row.entry_date ?? ""),
                description: String(row.description ?? "-"),
                reference_type: String(row.reference_type ?? "-"),
                admin_debit: String(row.admin_debit ?? "0"),
                admin_credit: String(row.admin_credit ?? "0"),
                counterparty_debit: String(row.counterparty_debit ?? "0"),
                counterparty_credit: String(row.counterparty_credit ?? "0"),
                running_balance: String(row.running_balance ?? "0"),
                balance_side: String(row.balance_side ?? "-"),
              })),
              total_debit: String(payload.total_debit ?? "0"),
              total_credit: String(payload.total_credit ?? "0"),
              balance: String(payload.balance ?? "0"),
              balance_side: String(payload.balance_side ?? "-"),
            });
          } catch (error) {
            setStatement(null);
            setStatementFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
          } finally {
            setStatementLoading(false);
          }
        })();
      } else {
        setStatement(null);
      }
      return;
    }
    void loadStatement(selectedAccount);
  }, [selectedAccount, selectedSelfAccountId, tab, loadStatement]);

  useEffect(() => {
    if (tab === "VENDOR" && selectedAccount?.party_id) {
      void loadVendorBills(selectedAccount.party_id);
    } else {
      setVendorBills([]);
    }
    setBillAllocations({});
  }, [selectedAccount?.party_id, tab, loadVendorBills]);

  useEffect(() => {
    if (tab !== "VENDOR") {
      setVendorPaymentWizardOpen(false);
    }
    if (tab !== "CUSTOMER") {
      setCustomerReceiptWizardOpen(false);
    }
  }, [tab]);

  const directionLabel = useMemo(
    () => (tab === "VENDOR" ? "Paid Amount" : "Received Amount"),
    [tab]
  );
  const directionValue = useMemo(
    () => (tab === "VENDOR" ? "OUTGOING" : "INCOMING"),
    [tab]
  );

  async function submitPayment() {
    if (!canWriteLedger) {
      return;
    }
    if (!selectedAccount) {
      toast.error("Select an account first.");
      return;
    }
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }
    setPostingPayment(true);
    try {
      await postBackend("/finance/party-ledger/payments", {
        party_type: selectedAccount.party_type,
        party_id: selectedAccount.party_id,
        amount: Number(paymentAmount),
        direction: directionValue,
        self_account_id: selectedSelfAccountId || null,
        payment_mode: paymentMode || null,
        payment_date: paymentDate || null,
        reference_no: referenceNo || null,
        note: paymentNote || null,
        purchase_bill_allocations:
          tab === "VENDOR"
            ? vendorBills
                .map((bill) => ({
                  purchase_bill_id: bill.id,
                  allocated_amount: Number(billAllocations[bill.id] || 0),
                }))
                .filter((row) => row.allocated_amount > 0)
            : [],
        sales_invoice_allocations: [],
      });
      toast.success("Ledger payment entry added.");
      setPaymentAmount("");
      setPaymentMode("");
      setPaymentDate("");
      setSelectedSelfAccountId("");
      setBillAllocations({});
      setReferenceNo("");
      setPaymentNote("");
      if (tab !== "SELF") {
        await loadAccounts(tab, search);
      }
      const refreshed = accounts.find((row) => row.account_id === selectedAccount.account_id) ?? selectedAccount;
      setSelectedAccount(refreshed);
      await loadStatement(refreshed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment posting failed");
    } finally {
      setPostingPayment(false);
    }
  }

  async function submitSelfAccount() {
    if (!canWriteLedger) {
      return;
    }
    if (!selfAccountName.trim() || !selfAccountOpeningDate) {
      toast.error("Self account name and opening balance date are required.");
      return;
    }
    setCreatingSelfAccount(true);
    try {
      await postBackend("/finance/self-accounts", {
        name: selfAccountName.trim(),
        account_type: selfAccountType.trim() || null,
        opening_balance: Number(selfAccountOpeningBalance || 0),
        opening_balance_side: selfAccountOpeningSide,
        opening_balance_date: selfAccountOpeningDate,
        note: selfAccountNote.trim() || null,
        is_active: true,
      });
      toast.success("Self account added.");
      setOpenSelfAccountDialog(false);
      setSelfAccountName("");
      setSelfAccountType("");
      setSelfAccountOpeningBalance("");
      setSelfAccountOpeningSide("DR");
      setSelfAccountOpeningDate("");
      setSelfAccountNote("");
      await loadSelfAccounts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Self account create failed");
    } finally {
      setCreatingSelfAccount(false);
    }
  }

  async function createAccountCategory() {
    if (!canWriteLedger) {
      return;
    }
    if (!newCategoryCode.trim() || !newCategoryName.trim()) {
      toast.error("Category code and name are required.");
      return;
    }
    setCreatingCategory(true);
    try {
      const created = asObject(
        await postBackend("/masters/account-categories", {
          code: newCategoryCode.trim(),
          name: newCategoryName.trim(),
          party_type: tab,
          description: newCategoryDescription.trim() || null,
          is_active: true,
        })
      );
      setOpenCategoryDialog(false);
      setNewCategoryCode("");
      setNewCategoryName("");
      setNewCategoryDescription("");
      toast.success(`Account category added: ${String(created.name ?? newCategoryName.trim())}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account category create failed");
    } finally {
      setCreatingCategory(false);
    }
  }

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as LedgerTab)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="VENDOR">Vendor Accounts</TabsTrigger>
        <TabsTrigger value="CUSTOMER">Customer Accounts</TabsTrigger>
        <TabsTrigger value="SELF">Self Accounts</TabsTrigger>
      </TabsList>

      <TabsContent value={tab} className="space-y-4">
        {permissionsLoaded && !canReadLedger ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You have no Accounting module access.
          </p>
        ) : null}
        {permissionsLoaded && canReadLedger && !canWriteLedger ? (
          <p className="rounded-md border/30 px-3 py-2 text-sm text-muted-foreground">
            Read-only access. Payment posting and account-category creation are hidden.
          </p>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>
                  {tab === "VENDOR" ? "Vendor Ledger Accounts" : tab === "CUSTOMER" ? "Customer Ledger Accounts" : "Self Accounts"}
                </CardTitle>
                <Dialog open={openCategoryDialog} onOpenChange={(open) => setOpenCategoryDialog(canWriteLedger ? open : false)}>
                  {canWriteLedger && tab !== "SELF" ? (
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">+ Add Account Category</Button>
                    </DialogTrigger>
                  ) : null}
                  <DialogContent className="w-[92vw] max-w-[520px]">
                    <DialogHeader>
                      <DialogTitle>Add {tab === "VENDOR" ? "Vendor" : "Customer"} Account Category</DialogTitle>
                      <DialogDescription>Create a ledger account category for this party type.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label>Code *</Label>
                        <Input value={newCategoryCode} onChange={(e) => setNewCategoryCode(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Name *</Label>
                        <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Description</Label>
                        <Input value={newCategoryDescription} onChange={(e) => setNewCategoryDescription(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpenCategoryDialog(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={() => void createAccountCategory()}
                        disabled={!canWriteLedger || creatingCategory || !newCategoryCode.trim() || !newCategoryName.trim()}
                      >
                        {creatingCategory ? "Adding..." : "Add Account Category"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Dialog open={openSelfAccountDialog} onOpenChange={(open) => setOpenSelfAccountDialog(canWriteLedger ? open : false)}>
                  {canWriteLedger && tab === "SELF" ? (
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">+ Add Self Account</Button>
                    </DialogTrigger>
                  ) : null}
                  <DialogContent className="w-[92vw] max-w-[520px]">
                    <DialogHeader>
                      <DialogTitle>Add Self Account</DialogTitle>
                      <DialogDescription>Create a cash/bank/self account with an opening balance.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label>Name *</Label>
                        <Input value={selfAccountName} onChange={(e) => setSelfAccountName(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Type</Label>
                        <Input value={selfAccountType} onChange={(e) => setSelfAccountType(e.target.value)} placeholder="State Bank / HDFC / Cash" />
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1 md:col-span-1">
                          <Label>Opening Balance</Label>
                          <Input type="number" min={0} value={selfAccountOpeningBalance} onChange={(e) => setSelfAccountOpeningBalance(e.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-1">
                          <Label>Side</Label>
                          <select
                            className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={selfAccountOpeningSide}
                            onChange={(e) => setSelfAccountOpeningSide(e.target.value)}
                          >
                            <option value="DR">DR</option>
                            <option value="CR">CR</option>
                          </select>
                        </div>
                        <div className="space-y-1 md:col-span-1">
                          <Label>Opening Date *</Label>
                          <Input type="date" value={selfAccountOpeningDate} onChange={(e) => setSelfAccountOpeningDate(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Note</Label>
                        <Input value={selfAccountNote} onChange={(e) => setSelfAccountNote(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setOpenSelfAccountDialog(false)}>Cancel</Button>
                      <Button type="button" onClick={() => void submitSelfAccount()} disabled={!canWriteLedger || creatingSelfAccount || !selfAccountName.trim() || !selfAccountOpeningDate}>
                        {creatingSelfAccount ? "Adding..." : "Add Self Account"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {tab !== "SELF" ? (
                <div className="flex gap-2">
                  <Input
                    placeholder={`Search ${tab === "VENDOR" ? "vendor" : "customer"} name`}
                    value={searchInput}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchInput(value);
                      if (value.trim() === "" && search !== "") {
                        setSearch("");
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearch(searchInput.trim());
                      }
                    }}
                  />
                  <Button onClick={() => setSearch(searchInput.trim())} disabled={accountsLoading}>
                    Search
                  </Button>
                </div>
              ) : null}
              {accountsFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{accountsFeedback}</p> : null}
              <div className="max-h-[560px] overflow-y-auto rounded-lg border">
                {accountsLoading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={`acct-skeleton-${index}`} className="h-12 w-full" />
                    ))}
                  </div>
                ) : tab === "SELF" ? (
                  selfAccounts.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">No self accounts found.</p>
                  ) : (
                    selfAccounts.map((account) => (
                      <button
                        key={account.id}
                        type="button"
                        className={`block w-full border-b px-3 py-3 text-left text-sm last:border-b-0 ${
                          selectedSelfAccountId === account.id ? "bg-muted/50" : ""
                        }`}
                        onClick={() => setSelectedSelfAccountId(account.id)}
                      >
                        <p className="font-medium">{account.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {account.account_type || "Self Account"} | Opening {formatAmount(account.opening_balance)} {account.opening_balance_side}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">Opening Date {formatDate(account.opening_balance_date)}</p>
                      </button>
                    ))
                  )
                ) : accounts.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No accounts found.</p>
                ) : (
                  accounts.map((account) => (
                    <button
                      key={account.account_id}
                      type="button"
                      className={`block w-full border-b px-3 py-3 text-left text-sm last:border-b-0 ${
                        selectedAccount?.account_id === account.account_id ? "bg-muted/50" : ""
                      }`}
                      onClick={() => setSelectedAccount(account)}
                    >
                      <p className="font-medium">{account.party_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Account Category {account.account_category_name || "-"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Admin Dr {formatAmount(account.total_debit)} | Admin Cr {formatAmount(account.total_credit)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Balance {formatAmount(account.balance)} {account.balance_side}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  {tab === "SELF"
                    ? selfAccounts.find((row) => row.id === selectedSelfAccountId)?.name || "Self Account Statement"
                    : selectedAccount
                      ? selectedAccount.party_name
                      : "Ledger Statement"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statementFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{statementFeedback}</p> : null}
                {(tab === "SELF" ? Boolean(selectedSelfAccountId) : Boolean(selectedAccount)) ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-md border p-3 text-sm">
                      <p className="text-muted-foreground">Admin Debit</p>
                      <p className="text-lg font-semibold">{formatAmount(statement?.total_debit ?? "0")}</p>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <p className="text-muted-foreground">Admin Credit</p>
                      <p className="text-lg font-semibold">{formatAmount(statement?.total_credit ?? "0")}</p>
                    </div>
                    <div className="rounded-md border p-3 text-sm">
                      <p className="text-muted-foreground">Balance</p>
                      <p className="text-lg font-semibold">
                        {formatAmount(statement?.balance ?? "0")} {statement?.balance_side ?? "-"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Select an account to view statement.</p>
                )}

                {(tab === "SELF" ? Boolean(selectedSelfAccountId) : Boolean(selectedAccount)) ? (
                  <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    {tab === "SELF"
                      ? "Showing self-account transaction view ordered by accounting date."
                      : "Showing admin ledger view. Counterparty impact is listed inside each entry for reference."}
                  </div>
                ) : null}

                <div className="overflow-hidden rounded-lg border">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                        <TableHead className="w-[14%]">Date</TableHead>
                        <TableHead className="w-[42%]">Particulars</TableHead>
                        <TableHead className="w-[14%]">Debit</TableHead>
                        <TableHead className="w-[14%]">Credit</TableHead>
                        <TableHead className="w-[16%]">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statementLoading ? (
                        Array.from({ length: 8 }).map((_, index) => (
                          <TableRow key={`statement-skeleton-${index}`}>
                            <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                            <TableCell>
                              <Skeleton className="h-5 w-40 dark:h-5" />
                              <Skeleton className="mt-2 h-4 w-52 dark:h-4" />
                            </TableCell>
                            <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                            <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                          </TableRow>
                        ))
                      ) : !statement || statement.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No ledger entries found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        statement.items.map((row, index) => (
                          <TableRow key={row.entry_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                            <TableCell>{formatDate(row.entry_date)}</TableCell>
                            <TableCell>
                              <p className="truncate font-medium" title={row.description}>{row.description}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">
                                {row.reference_type} | {tab === "VENDOR" ? "Vendor" : "Customer"} Dr {formatAmount(row.counterparty_debit)} | {tab === "VENDOR" ? "Vendor" : "Customer"} Cr {formatAmount(row.counterparty_credit)}
                              </p>
                            </TableCell>
                            <TableCell>{formatAmount(row.admin_debit)}</TableCell>
                            <TableCell>{formatAmount(row.admin_credit)}</TableCell>
                            <TableCell>
                              {formatAmount(row.running_balance)} {row.balance_side}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {tab !== "SELF" ? (
              <Card>
                <CardHeader>
                  <CardTitle>{tab === "VENDOR" ? "Record Vendor Payment" : "Record Customer Receipt"}</CardTitle>
                  {tab === "VENDOR" && selectedAccount ? (
                    <p className="text-sm font-normal text-muted-foreground">
                      If you skipped payment from Purchase, open the payment wizard for new payment, on-account, or link an existing
                      payment to bills—the same options as after saving a bill.
                    </p>
                  ) : null}
                  {tab === "CUSTOMER" && selectedAccount ? (
                    <p className="text-sm font-normal text-muted-foreground">
                      If you skipped receipt from Sales, open the receipt wizard to allocate to invoices (due dates shown), link an
                      existing incoming payment, or post on-account.
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {tab === "VENDOR" && selectedAccount && canWriteLedger ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => setVendorPaymentWizardOpen(true)}>
                        Payment wizard (new / link to bills)
                      </Button>
                    </div>
                  ) : null}
                  {tab === "CUSTOMER" && selectedAccount && canWriteLedger ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => setCustomerReceiptWizardOpen(true)}>
                        Receipt wizard (new / link to invoices)
                      </Button>
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="space-y-1">
                      <Label>{directionLabel}</Label>
                      <Input type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Payment Mode</Label>
                      <Input value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder="Cash / UPI / Bank" />
                    </div>
                    <div className="space-y-1">
                      <Label>Accounting Date</Label>
                      <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Self Account</Label>
                      <select
                        className="flex h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={selectedSelfAccountId}
                        onChange={(e) => setSelectedSelfAccountId(e.target.value)}
                      >
                        <option value="">Unspecified</option>
                        {selfAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Reference No</Label>
                      <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="Txn / Voucher / Ref" />
                    </div>
                    <div className="space-y-1">
                      <Label>Note</Label>
                      <Input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Optional note" />
                    </div>
                  </div>
                  {tab === "VENDOR" && vendorBills.length > 0 ? (
                    <div className="space-y-2 rounded-md border p-3">
                      <p className="text-sm font-medium">Allocate To Purchase Bills</p>
                      <div className="grid gap-2">
                        {vendorBills.map((bill) => (
                          <div key={bill.id} className="grid gap-2 md:grid-cols-[1fr_140px] md:items-center">
                            <p className="text-sm">
                              {bill.bill_number} | {formatDate(bill.bill_date)} | {formatAmount(bill.total_amount)}
                            </p>
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              value={billAllocations[bill.id] ?? ""}
                              onChange={(e) =>
                                setBillAllocations((prev) => ({
                                  ...prev,
                                  [bill.id]: e.target.value,
                                }))
                              }
                              placeholder="Allocate"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <Button onClick={() => void submitPayment()} disabled={!canWriteLedger || postingPayment || !selectedAccount}>
                    {postingPayment ? "Posting..." : tab === "VENDOR" ? "Quick post" : tab === "CUSTOMER" ? "Quick post" : "Record Receipt"}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Self Account Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Incoming and outgoing dated transactions from vendor payments, customer receipts, and opening balances will appear under the selected self account.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        {selectedAccount && tab === "VENDOR" ? (
          <PurchaseBillRefWizard
            open={vendorPaymentWizardOpen}
            onOpenChange={setVendorPaymentWizardOpen}
            vendorId={selectedAccount.party_id}
            apiBase="accounting"
            onRecorded={async () => {
              await loadAccounts("VENDOR", search);
              if (selectedAccount) {
                await loadStatement(selectedAccount);
                await loadVendorBills(selectedAccount.party_id);
              }
            }}
          />
        ) : null}
        {selectedAccount && tab === "CUSTOMER" ? (
          <SalesInvoiceRefWizard
            open={customerReceiptWizardOpen}
            onOpenChange={setCustomerReceiptWizardOpen}
            customerId={selectedAccount.party_id}
            apiBase="accounting"
            onRecorded={async () => {
              await loadAccounts("CUSTOMER", search);
              if (selectedAccount) {
                await loadStatement(selectedAccount);
              }
            }}
          />
        ) : null}
      </TabsContent>
    </Tabs>
  );
}
