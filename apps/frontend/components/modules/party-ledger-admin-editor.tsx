"use client";

import { useEffect, useMemo, useState } from "react";
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

type PartyKind = "VENDOR" | "CUSTOMER";

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
  const [tab, setTab] = useState<PartyKind>("VENDOR");
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
  const [referenceNo, setReferenceNo] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [postingPayment, setPostingPayment] = useState(false);
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");

  async function loadAccounts(kind: PartyKind, term: string) {
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
  }

  async function loadStatement(account: AccountRow | null) {
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
  }

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
    void loadAccounts(tab, search);
  }, [permissionsLoaded, canReadLedger, search, tab]);

  useEffect(() => {
    void loadStatement(selectedAccount);
  }, [selectedAccount]);

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
        payment_mode: paymentMode || null,
        reference_no: referenceNo || null,
        note: paymentNote || null,
      });
      toast.success("Ledger payment entry added.");
      setPaymentAmount("");
      setPaymentMode("");
      setReferenceNo("");
      setPaymentNote("");
      await loadAccounts(tab, search);
      const refreshed = accounts.find((row) => row.account_id === selectedAccount.account_id) ?? selectedAccount;
      setSelectedAccount(refreshed);
      await loadStatement(refreshed);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment posting failed");
    } finally {
      setPostingPayment(false);
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
    <Tabs value={tab} onValueChange={(value) => setTab(value as PartyKind)} className="space-y-4">
      <TabsList>
        <TabsTrigger value="VENDOR">Vendor Accounts</TabsTrigger>
        <TabsTrigger value="CUSTOMER">Customer Accounts</TabsTrigger>
      </TabsList>

      <TabsContent value={tab} className="space-y-4">
        {permissionsLoaded && !canReadLedger ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You have no credit/debit notes module access.
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
                <CardTitle>{tab === "VENDOR" ? "Vendor Ledger Accounts" : "Customer Ledger Accounts"}</CardTitle>
                <Dialog open={openCategoryDialog} onOpenChange={(open) => setOpenCategoryDialog(canWriteLedger ? open : false)}>
                  {canWriteLedger ? (
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
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
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
              {accountsFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{accountsFeedback}</p> : null}
              <div className="max-h-[560px] overflow-y-auto rounded-lg border">
                {accountsLoading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <Skeleton key={`acct-skeleton-${index}`} className="h-12 w-full" />
                    ))}
                  </div>
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
                <CardTitle>{selectedAccount ? selectedAccount.party_name : "Ledger Statement"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {statementFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{statementFeedback}</p> : null}
                {selectedAccount ? (
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

                {selectedAccount ? (
                  <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                    Showing admin ledger view. Counterparty impact is listed inside each entry for reference.
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

            <Card>
              <CardHeader>
                <CardTitle>{tab === "VENDOR" ? "Record Vendor Payment" : "Record Customer Receipt"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>{directionLabel}</Label>
                    <Input type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>Payment Mode</Label>
                    <Input value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} placeholder="Cash / UPI / Bank" />
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
                <Button onClick={() => void submitPayment()} disabled={!canWriteLedger || postingPayment || !selectedAccount}>
                  {postingPayment ? "Posting..." : tab === "VENDOR" ? "Record Payment" : "Record Receipt"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
