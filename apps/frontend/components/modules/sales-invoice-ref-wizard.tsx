"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, postBackend } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SalesInvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  total_amount: string;
};

type CustomerPaymentForAllocation = {
  id: string;
  amount: string;
  payment_date: string;
  reference_no: string | null;
  allocated_total: string;
  remaining: string;
};

export type SalesInvoiceRefApiBase = "sales" | "accounting";

type SalesInvoiceRefWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  highlightSalesFinalInvoiceId?: string;
  apiBase?: SalesInvoiceRefApiBase;
  onRecorded?: () => void | Promise<void>;
};

function receiptApiPaths(apiBase: SalesInvoiceRefApiBase, customerId: string) {
  if (apiBase === "accounting") {
    return {
      invoices: `/finance/party-ledger/customers/${customerId}/sales-invoices-for-receipt`,
      createPayment: `/finance/party-ledger/payments`,
      paymentsForAllocation: `/finance/party-ledger/customers/${customerId}/payments-for-invoice-allocation`,
      appendAllocations: (paymentId: string) =>
        `/finance/party-ledger/customers/${customerId}/payments/${paymentId}/sales-invoice-allocations`,
    };
  }
  return {
    invoices: `/sales/sales-entry/customers/${customerId}/sales-invoices-for-receipt`,
    createPayment: `/sales/sales-entry/customer-receipts`,
    paymentsForAllocation: `/sales/sales-entry/customers/${customerId}/payments-for-invoice-allocation`,
    appendAllocations: (paymentId: string) =>
      `/sales/sales-entry/customers/${customerId}/payments/${paymentId}/sales-invoice-allocations`,
  };
}

export function SalesInvoiceRefWizard({
  open,
  onOpenChange,
  customerId,
  highlightSalesFinalInvoiceId,
  apiBase = "sales",
  onRecorded,
}: SalesInvoiceRefWizardProps) {
  const [step, setStep] = useState<"choose" | "newPay" | "onAccount" | "linkExisting">("choose");
  const [invoices, setInvoices] = useState<SalesInvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [customerPayments, setCustomerPayments] = useState<CustomerPaymentForAllocation[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const [selectedPaymentId, setSelectedPaymentId] = useState<string>("");

  const paths = useMemo(() => receiptApiPaths(apiBase, customerId), [apiBase, customerId]);

  const reset = useCallback(() => {
    setStep("choose");
    setAmount("");
    setReferenceNo("");
    setNote("");
    setPaymentMode("UPI");
    setAllocations({});
    setSelectedPaymentId("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setLoadingInvoices(true);
    void (async () => {
      try {
        const res = await fetchBackend(paths.invoices);
        const rows = asArray(res).map((row) => {
          const o = asObject(row);
          return {
            id: String(o.id ?? ""),
            invoice_number: String(o.invoice_number ?? ""),
            invoice_date: String(o.invoice_date ?? ""),
            due_date: String(o.due_date ?? ""),
            total_amount: String(o.total_amount ?? "0"),
          } satisfies SalesInvoiceRow;
        });
        setInvoices(rows);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load invoices");
        setInvoices([]);
      } finally {
        setLoadingInvoices(false);
      }
    })();
  }, [open, reset, paths.invoices]);

  useEffect(() => {
    if (!open || !highlightSalesFinalInvoiceId) return;
    setAllocations((prev) => ({ ...prev, [highlightSalesFinalInvoiceId]: prev[highlightSalesFinalInvoiceId] ?? "" }));
  }, [highlightSalesFinalInvoiceId, open]);

  const loadCustomerPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const res = await fetchBackend(paths.paymentsForAllocation);
      const rows = asArray(res).map((row) => {
        const o = asObject(row);
        return {
          id: String(o.id ?? ""),
          amount: String(o.amount ?? "0"),
          payment_date: String(o.payment_date ?? ""),
          reference_no: o.reference_no != null ? String(o.reference_no) : null,
          allocated_total: String(o.allocated_total ?? "0"),
          remaining: String(o.remaining ?? "0"),
        } satisfies CustomerPaymentForAllocation;
      });
      setCustomerPayments(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load receipts");
      setCustomerPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  }, [paths.paymentsForAllocation]);

  useEffect(() => {
    if (!open || step !== "linkExisting") return;
    void loadCustomerPayments();
  }, [open, step, loadCustomerPayments]);

  const selectedPayment = useMemo(
    () => customerPayments.find((p) => p.id === selectedPaymentId),
    [customerPayments, selectedPaymentId],
  );

  const buildNewReceiptAllocations = useCallback(
    (amt: number) => {
      const rows = Object.entries(allocations)
        .map(([sales_final_invoice_id, v]) => ({
          sales_final_invoice_id,
          allocated_amount: Number(v),
        }))
        .filter((r) => Number.isFinite(r.allocated_amount) && r.allocated_amount > 0);
      if (rows.length > 0) {
        return rows.map((r) => ({
          sales_final_invoice_id: r.sales_final_invoice_id,
          allocated_amount: r.allocated_amount,
        }));
      }
      if (highlightSalesFinalInvoiceId && Number.isFinite(amt) && amt > 0) {
        return [{ sales_final_invoice_id: highlightSalesFinalInvoiceId, allocated_amount: amt }];
      }
      return [];
    },
    [allocations, highlightSalesFinalInvoiceId],
  );

  const partyBodyBase = useCallback(
    () => ({
      party_type: "CUSTOMER",
      party_id: customerId,
      payment_mode: paymentMode || null,
      payment_date: new Date().toISOString().slice(0, 10),
      reference_no: referenceNo.trim() || null,
      purchase_bill_allocations: [] as { purchase_bill_id: string; allocated_amount: number }[],
    }),
    [customerId, paymentMode, referenceNo],
  );

  const submitOnAccount = useCallback(async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid receipt amount.");
      return;
    }
    setSubmitting(true);
    try {
      await postBackend(paths.createPayment, {
        ...partyBodyBase(),
        amount: amt,
        direction: "INCOMING",
        note: note.trim() || "On-account customer receipt",
        sales_invoice_allocations: [],
      });
      toast.success("Customer receipt recorded.");
      await onRecorded?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Receipt failed");
    } finally {
      setSubmitting(false);
    }
  }, [amount, note, onOpenChange, onRecorded, partyBodyBase, paths.createPayment]);

  const submitNewPay = useCallback(async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter total receipt amount.");
      return;
    }
    const sales_invoice_allocations = buildNewReceiptAllocations(amt);
    if (sales_invoice_allocations.length === 0) {
      toast.error("Allocate to at least one invoice, or use “Link existing receipt” if funds were already posted.");
      return;
    }
    const sum = sales_invoice_allocations.reduce((s, r) => s + r.allocated_amount, 0);
    if (sum > amt + 0.0001) {
      toast.error("Allocations cannot exceed receipt amount.");
      return;
    }
    setSubmitting(true);
    try {
      await postBackend(paths.createPayment, {
        ...partyBodyBase(),
        amount: amt,
        direction: "INCOMING",
        note: note.trim() || "Customer receipt with invoice allocations",
        sales_invoice_allocations: sales_invoice_allocations.map((r) => ({
          sales_final_invoice_id: r.sales_final_invoice_id,
          allocated_amount: r.allocated_amount,
        })),
      });
      toast.success("Receipt recorded and linked to invoices.");
      await onRecorded?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Receipt failed");
    } finally {
      setSubmitting(false);
    }
  }, [amount, buildNewReceiptAllocations, note, onOpenChange, onRecorded, partyBodyBase, paths.createPayment]);

  const submitLinkExisting = useCallback(async () => {
    if (!selectedPaymentId) {
      toast.error("Select a receipt to link.");
      return;
    }
    const rows = Object.entries(allocations)
      .map(([sales_final_invoice_id, v]) => ({
        sales_final_invoice_id,
        allocated_amount: Number(v),
      }))
      .filter((r) => Number.isFinite(r.allocated_amount) && r.allocated_amount > 0);
    if (!rows.length) {
      toast.error("Enter at least one invoice allocation.");
      return;
    }
    const sum = rows.reduce((s, r) => s + r.allocated_amount, 0);
    const rem = selectedPayment ? Number(selectedPayment.remaining) : 0;
    if (selectedPayment && sum > rem + 0.0001) {
      toast.error("Allocations exceed the unallocated amount on this receipt.");
      return;
    }
    setSubmitting(true);
    try {
      await postBackend(paths.appendAllocations(selectedPaymentId), {
        allocations: rows.map((r) => ({
          sales_final_invoice_id: r.sales_final_invoice_id,
          allocated_amount: r.allocated_amount,
        })),
      });
      toast.success("Receipt linked to invoices.");
      await onRecorded?.();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Allocation failed");
    } finally {
      setSubmitting(false);
    }
  }, [allocations, onOpenChange, onRecorded, paths, selectedPayment, selectedPaymentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg font-mono">
        <DialogHeader>
          <DialogTitle>Receipt reference</DialogTitle>
        </DialogHeader>
        {step === "choose" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {apiBase === "accounting"
                ? "Record a customer receipt against sales invoices (credit sales): new receipt with allocations, link an existing incoming payment, or post on-account."
                : "After a credit sale, record how this receipt applies: new incoming payment with invoice links, link an existing receipt, or on-account only."}
            </p>
            {loadingInvoices ? <p className="text-xs text-muted-foreground">Loading invoices…</p> : null}
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("newPay")}>
                New receipt — link to one or more invoices
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep("linkExisting")}>
                Link existing receipt — allocate to invoices
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep("onAccount")}>
                On-account only — no invoice link
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Skip
              </Button>
            </div>
          </div>
        ) : null}

        {step === "newPay" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Creates one incoming receipt. Enter per-invoice amounts below
              {highlightSalesFinalInvoiceId
                ? " (this invoice is highlighted; leave lines empty to put the full amount on it)"
                : ""}
              . Due dates show when the credit is expected.
            </p>
            <div className="space-y-1">
              <Label htmlFor="rcpt-amount">Total receipt amount</Label>
              <Input id="rcpt-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rcpt-ref">Reference no</Label>
              <Input id="rcpt-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rcpt-mode">Payment mode</Label>
              <Input id="rcpt-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rcpt-note">Note</Label>
              <Input id="rcpt-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-2">
              {invoices.length ? (
                invoices.map((inv) => (
                  <div key={inv.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
                    <div>
                      <div className="font-semibold">
                        {inv.invoice_number}
                        {inv.id === highlightSalesFinalInvoiceId ? <span className="ml-2 text-primary">(this invoice)</span> : null}
                      </div>
                      <div className="text-muted-foreground">
                        inv {inv.invoice_date} · due {inv.due_date} · total {Number(inv.total_amount).toFixed(2)}
                      </div>
                    </div>
                    <Input
                      className="h-8 w-24 text-right"
                      placeholder="0"
                      value={allocations[inv.id] ?? ""}
                      onChange={(e) => setAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                    />
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No invoices for this customer.</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submitNewPay()}>
                {submitting ? "Saving…" : "Record receipt"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "onAccount" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Records an incoming receipt without linking to specific invoices.</p>
            <div className="space-y-1">
              <Label htmlFor="oa-amt">Amount</Label>
              <Input id="oa-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oa-ref">Reference no</Label>
              <Input id="oa-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oa-mode">Payment mode</Label>
              <Input id="oa-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oa-note">Note</Label>
              <Input id="oa-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submitOnAccount()}>
                {submitting ? "Saving…" : "Record receipt"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "linkExisting" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Choose a receipt that still has unallocated amount, then split how much applies to each invoice.
            </p>
            {loadingPayments ? (
              <p className="text-xs text-muted-foreground">Loading receipts…</p>
            ) : (
              <div className="space-y-1">
                <Label>Existing receipt</Label>
                <Select value={selectedPaymentId || undefined} onValueChange={(v) => setSelectedPaymentId(v)}>
                  <SelectTrigger className="w-full font-mono text-xs">
                    <SelectValue placeholder="Select receipt" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerPayments
                      .filter((p) => Number(p.remaining) > 0.0001)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id} className="font-mono text-xs">
                          {p.payment_date} · {p.reference_no || "—"} · amt {Number(p.amount).toFixed(2)} · left{" "}
                          {Number(p.remaining).toFixed(2)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {selectedPayment ? (
                  <p className="text-xs text-muted-foreground">
                    Unallocated: {Number(selectedPayment.remaining).toFixed(2)} of {Number(selectedPayment.amount).toFixed(2)}
                  </p>
                ) : null}
              </div>
            )}
            <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-2">
              {invoices.length ? (
                invoices.map((inv) => (
                  <div key={inv.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
                    <div>
                      <div className="font-semibold">
                        {inv.invoice_number}
                        {inv.id === highlightSalesFinalInvoiceId ? <span className="ml-2 text-primary">(this invoice)</span> : null}
                      </div>
                      <div className="text-muted-foreground">
                        inv {inv.invoice_date} · due {inv.due_date} · total {Number(inv.total_amount).toFixed(2)}
                      </div>
                    </div>
                    <Input
                      className="h-8 w-24 text-right"
                      placeholder="0"
                      value={allocations[inv.id] ?? ""}
                      onChange={(e) => setAllocations((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                    />
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No invoices for this customer.</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button type="button" disabled={submitting || !selectedPaymentId} onClick={() => void submitLinkExisting()}>
                {submitting ? "Saving…" : "Link to invoices"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
