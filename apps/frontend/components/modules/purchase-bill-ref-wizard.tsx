"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, postBackend } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PurchaseBillRow = {
  id: string;
  bill_number: string;
  bill_date: string;
  vendor_id: string | null;
  total_amount: string;
};

type PurchaseBillRefWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorId: string;
  /** Bill just saved — pre-selected for allocation when using “Adjust”. */
  highlightPurchaseBillId?: string;
};

export function PurchaseBillRefWizard({ open, onOpenChange, vendorId, highlightPurchaseBillId }: PurchaseBillRefWizardProps) {
  const [step, setStep] = useState<"choose" | "new" | "adj">("choose");
  const [bills, setBills] = useState<PurchaseBillRow[]>([]);
  const [loadingBills, setLoadingBills] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [paymentMode, setPaymentMode] = useState("NEFT");
  const [allocations, setAllocations] = useState<Record<string, string>>({});

  const reset = useCallback(() => {
    setStep("choose");
    setAmount("");
    setReferenceNo("");
    setNote("");
    setPaymentMode("NEFT");
    setAllocations({});
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setLoadingBills(true);
    void (async () => {
      try {
        const res = await fetchBackend("/procurement/purchase-bills");
        const rows = asArray(res).map((row) => {
          const o = asObject(row);
          return {
            id: String(o.id ?? ""),
            bill_number: String(o.bill_number ?? ""),
            bill_date: String(o.bill_date ?? ""),
            vendor_id: o.vendor_id ? String(o.vendor_id) : null,
            total_amount: String(o.total_amount ?? "0"),
          } satisfies PurchaseBillRow;
        });
        setBills(rows.filter((b) => b.vendor_id === vendorId));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load bills");
        setBills([]);
      } finally {
        setLoadingBills(false);
      }
    })();
  }, [open, reset, vendorId]);

  useEffect(() => {
    if (!open || !highlightPurchaseBillId) return;
    setAllocations((prev) => ({ ...prev, [highlightPurchaseBillId]: prev[highlightPurchaseBillId] ?? "" }));
  }, [highlightPurchaseBillId, open]);

  const vendorBills = useMemo(() => bills, [bills]);

  const submitNewRef = useCallback(async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter a valid payment amount.");
      return;
    }
    setSubmitting(true);
    try {
      await postBackend("/procurement/purchase-entry/vendor-payments", {
        party_type: "VENDOR",
        party_id: vendorId,
        amount: amt,
        direction: "OUTGOING",
        payment_mode: paymentMode || null,
        payment_date: new Date().toISOString().slice(0, 10),
        reference_no: referenceNo.trim() || null,
        note: note.trim() || "On-account vendor payment (new reference)",
        purchase_bill_allocations: [],
      });
      toast.success("Vendor payment recorded.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }, [amount, note, onOpenChange, paymentMode, referenceNo, vendorId]);

  const submitAdj = useCallback(async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Enter total payment amount.");
      return;
    }
    const rows = Object.entries(allocations)
      .map(([purchase_bill_id, v]) => ({
        purchase_bill_id,
        allocated_amount: Number(v),
      }))
      .filter((r) => Number.isFinite(r.allocated_amount) && r.allocated_amount > 0);
    if (!rows.length) {
      toast.error("Allocate at least one bill line.");
      return;
    }
    const sum = rows.reduce((s, r) => s + r.allocated_amount, 0);
    if (sum > amt + 0.0001) {
      toast.error("Allocations cannot exceed payment amount.");
      return;
    }
    setSubmitting(true);
    try {
      await postBackend("/procurement/purchase-entry/vendor-payments", {
        party_type: "VENDOR",
        party_id: vendorId,
        amount: amt,
        direction: "OUTGOING",
        payment_mode: paymentMode || null,
        payment_date: new Date().toISOString().slice(0, 10),
        reference_no: referenceNo.trim() || null,
        note: note.trim() || "Vendor payment with bill allocations",
        purchase_bill_allocations: rows.map((r) => ({
          purchase_bill_id: r.purchase_bill_id,
          allocated_amount: r.allocated_amount,
        })),
      });
      toast.success("Payment allocated to bills.");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setSubmitting(false);
    }
  }, [allocations, amount, note, onOpenChange, paymentMode, referenceNo, vendorId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg font-mono">
        <DialogHeader>
          <DialogTitle>Payment reference</DialogTitle>
        </DialogHeader>
        {step === "choose" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Record how this purchase bill ties to vendor payments: a new on-account payment, or allocate an outgoing payment to this and other bills.
            </p>
            {loadingBills ? <p className="text-xs text-muted-foreground">Loading vendor bills…</p> : null}
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("new")}>
                New reference — on-account payment
              </Button>
              <Button type="button" variant="outline" onClick={() => setStep("adj")}>
                Adjust — allocate payment to bills
              </Button>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Skip
              </Button>
            </div>
          </div>
        ) : null}

        {step === "new" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Creates an outgoing vendor payment on the ledger without linking to specific bills.</p>
            <div className="space-y-1">
              <Label htmlFor="pay-amount">Amount</Label>
              <Input id="pay-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-ref">Reference no</Label>
              <Input id="pay-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-mode">Payment mode</Label>
              <Input id="pay-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-note">Note</Label>
              <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submitNewRef()}>
                {submitting ? "Saving…" : "Record payment"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === "adj" ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Total payment and per-bill allocations (must not exceed total).</p>
            <div className="space-y-1">
              <Label htmlFor="adj-amount">Total payment amount</Label>
              <Input id="adj-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-ref">Reference no</Label>
              <Input id="adj-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adj-mode">Payment mode</Label>
              <Input id="adj-mode" value={paymentMode} onChange={(e) => setPaymentMode(e.target.value)} />
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded border p-2">
              {vendorBills.length ? (
                vendorBills.map((b) => (
                  <div key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
                    <div>
                      <div className="font-semibold">
                        {b.bill_number}
                        {b.id === highlightPurchaseBillId ? <span className="ml-2 text-primary">(this bill)</span> : null}
                      </div>
                      <div className="text-muted-foreground">
                        {b.bill_date} · total {Number(b.total_amount).toFixed(2)}
                      </div>
                    </div>
                    <Input
                      className="h-8 w-24 text-right"
                      placeholder="0"
                      value={allocations[b.id] ?? ""}
                      onChange={(e) => setAllocations((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    />
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No bills for this vendor.</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button type="button" disabled={submitting} onClick={() => void submitAdj()}>
                {submitting ? "Saving…" : "Record payment"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
