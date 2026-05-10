"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { asArray, fetchBackendFresh, postBackend } from "@/lib/backend-api";
import { invalidateByPrefixes } from "@/lib/state/api-cache-slice";
import { store } from "@/lib/state/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PendingCustomer = {
  sales_order_id: string;
  customer_id: string;
  customer_name: string;
  warehouse_id: string;
  invoice_number: string;
  source: string;
  source_label: string;
  status: string;
  created_at: string;
};

type PendingOrderItem = {
  sales_order_item_id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  selling_price: number;
  discount_percent: number;
  is_free_item: boolean;
};

type PendingOrder = {
  sales_order_id: string;
  invoice_number: string;
  warehouse_id: string;
  warehouse_name: string;
  source: string;
  source_label: string;
  status: string;
  created_at: string;
  items: PendingOrderItem[];
};

type CustomerSummary = {
  customer_id: string;
  customer_name: string;
  address_lines: string[];
  gstin: string | null;
  phone: string | null;
  route_name: string | null;
  annual_sales_amount: string;
  monthly_sales_amount: string;
  balance: string;
  balance_side: string;
  last_sale_date: string | null;
  last_receipt_date: string | null;
  recent_invoices: Array<{ invoice_number: string; invoice_date: string; total_amount: string }>;
  recent_receipts: Array<{ payment_date: string; amount: string; mode: string | null }>;
};

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
}

function formatMoney(value: string | number) {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num.toFixed(4) : "0.0000";
}

type SalesEntryWorkspaceProps = {
  canWriteSales: boolean;
  onCreated?: () => void;
  initialOrderId?: string;
  onConsumedInitial?: () => void;
};

export function SalesEntryWorkspace({ canWriteSales, onCreated, initialOrderId, onConsumedInitial }: SalesEntryWorkspaceProps) {
  const [pendingSearch, setPendingSearch] = useState("");
  const [pendingRows, setPendingRows] = useState<PendingCustomer[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDays, setDueDays] = useState("0");
  const [deliverQtyByItemId, setDeliverQtyByItemId] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [activeItemId, setActiveItemId] = useState("");
  const [showCustomerCreate, setShowCustomerCreate] = useState(false);
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    gstin: "",
    street_address_1: "",
    city: "",
    state: "",
    pincode: "",
  });
  const customerButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const referenceButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const invoiceDateRef = useRef<HTMLInputElement | null>(null);
  const pendingSearchRef = useRef<HTMLInputElement | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialHandledRef = useRef(false);

  function applyInvoiceDate(iso: string) {
    setInvoiceDate(iso);
    if (dueDate < iso) {
      setDueDate(iso);
      setDueDays("0");
    }
  }

  function applyDueDate(iso: string) {
    const normalized = iso < invoiceDate ? invoiceDate : iso;
    setDueDate(normalized);
    setDueDays(String(Math.max(0, Math.round((new Date(normalized).getTime() - new Date(invoiceDate).getTime()) / 86400000))));
  }

  function applyDueDays(raw: string) {
    const clean = raw.replace(/\D/g, "");
    setDueDays(clean);
    const next = new Date(`${invoiceDate}T00:00:00`);
    next.setDate(next.getDate() + Number(clean || 0));
    setDueDate(next.toISOString().slice(0, 10));
  }

  const loadPendingRows = useCallback(async (term: string) => {
    setPendingLoading(true);
    try {
      const params = new URLSearchParams();
      if (term.trim()) params.set("search", term.trim());
      const rows = asArray(await fetchBackendFresh(`/sales/sales-entry/pending-customers?${params.toString()}`)).map((row) => ({
        sales_order_id: String(row.sales_order_id ?? ""),
        customer_id: String(row.customer_id ?? ""),
        customer_name: String(row.customer_name ?? "-"),
        warehouse_id: String(row.warehouse_id ?? ""),
        invoice_number: String(row.invoice_number ?? "-"),
        source: String(row.source ?? "-"),
        source_label: String(row.source_label ?? row.source ?? "-"),
        status: String(row.status ?? "-"),
        created_at: String(row.created_at ?? ""),
      }));
      setPendingRows(rows);
      if (!selectedOrderId && rows[0]) {
        setSelectedOrderId(rows[0].sales_order_id);
      }
    } catch {
      setPendingRows([]);
    } finally {
      setPendingLoading(false);
    }
  }, [selectedOrderId]);

  const loadCustomerContext = useCallback(async (customerId: string, preferredOrderId?: string) => {
    if (!customerId) {
      setPendingOrders([]);
      setSummary(null);
      setSelectedOrderId("");
      return;
    }
    setSummaryLoading(true);
    try {
      const [ordersRes, summaryRes] = await Promise.all([
        fetchBackendFresh(`/sales/customers/${customerId}/pending-sales-orders`),
        fetchBackendFresh(`/sales/sales-entry/customers/${customerId}/summary`),
      ]);
      const orders = asArray(ordersRes).map((row) => ({
        sales_order_id: String(row.sales_order_id ?? ""),
        invoice_number: String(row.invoice_number ?? "-"),
        warehouse_id: String(row.warehouse_id ?? ""),
        warehouse_name: String(row.warehouse_name ?? "-"),
        source: String(row.source ?? "-"),
        source_label: String(row.source_label ?? row.source ?? "-"),
        status: String(row.status ?? "-"),
        created_at: String(row.created_at ?? ""),
        items: asArray(row.items).map((item) => ({
          sales_order_item_id: String(item.sales_order_item_id ?? ""),
          product_id: String(item.product_id ?? ""),
          sku: String(item.sku ?? "-"),
          product_name: String(item.product_name ?? "-"),
          unit: String(item.unit ?? "-"),
          quantity: toNumber(item.quantity),
          unit_price: toNumber(item.unit_price),
          selling_price: toNumber(item.selling_price ?? item.unit_price),
          discount_percent: toNumber(item.discount_percent),
          is_free_item: Boolean(item.is_free_item),
        })),
      }));
      const nextSelectedOrderId =
        orders.find((row) => row.sales_order_id === preferredOrderId)?.sales_order_id ??
        orders[0]?.sales_order_id ??
        "";
      setPendingOrders(orders);
      setSelectedOrderId(nextSelectedOrderId);
      setSummary({
        customer_id: String(summaryRes.customer_id ?? ""),
        customer_name: String(summaryRes.customer_name ?? "-"),
        address_lines: asArray(summaryRes.address_lines).map((item) => String(item)),
        gstin: summaryRes.gstin ? String(summaryRes.gstin) : null,
        phone: summaryRes.phone ? String(summaryRes.phone) : null,
        route_name: summaryRes.route_name ? String(summaryRes.route_name) : null,
        annual_sales_amount: String(summaryRes.annual_sales_amount ?? "0"),
        monthly_sales_amount: String(summaryRes.monthly_sales_amount ?? "0"),
        balance: String(summaryRes.balance ?? "0"),
        balance_side: String(summaryRes.balance_side ?? "DR"),
        last_sale_date: summaryRes.last_sale_date ? String(summaryRes.last_sale_date) : null,
        last_receipt_date: summaryRes.last_receipt_date ? String(summaryRes.last_receipt_date) : null,
        recent_invoices: asArray(summaryRes.recent_invoices).map((item) => ({
          invoice_number: String(item.invoice_number ?? ""),
          invoice_date: String(item.invoice_date ?? ""),
          total_amount: String(item.total_amount ?? "0"),
        })),
        recent_receipts: asArray(summaryRes.recent_receipts).map((item) => ({
          payment_date: String(item.payment_date ?? ""),
          amount: String(item.amount ?? "0"),
          mode: item.mode ? String(item.mode) : null,
        })),
      });
      const qtyDrafts: Record<string, string> = {};
      for (const order of orders) {
        for (const item of order.items) {
          qtyDrafts[item.sales_order_item_id] = String(Math.max(0, Math.floor(item.quantity)));
        }
      }
      setDeliverQtyByItemId(qtyDrafts);
      setActiveItemId(
        orders[0]?.items.find((item) => !item.is_free_item)?.sales_order_item_id ??
          orders[0]?.items[0]?.sales_order_item_id ??
          ""
      );
    } catch (error) {
      setPendingOrders([]);
      setSummary(null);
      toast.error(error instanceof Error ? error.message : "Failed to load sales-entry context");
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingRows("");
  }, [loadPendingRows]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadPendingRows(pendingSearch);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [loadPendingRows, pendingSearch]);

  const selectedOrder = useMemo(
    () => pendingOrders.find((row) => row.sales_order_id === selectedOrderId) ?? null,
    [pendingOrders, selectedOrderId]
  );

  const pendingCustomers = useMemo(() => {
    const grouped = new Map<
      string,
      {
        customer_id: string;
        customer_name: string;
        challan_count: number;
        latest_created_at: string;
        latest_invoice_number: string;
        source_label: string;
      }
    >();
    for (const row of pendingRows) {
      const existing = grouped.get(row.customer_id);
      if (!existing) {
        grouped.set(row.customer_id, {
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          challan_count: 1,
          latest_created_at: row.created_at,
          latest_invoice_number: row.invoice_number,
          source_label: row.source_label,
        });
        continue;
      }
      existing.challan_count += 1;
      if (new Date(row.created_at).getTime() > new Date(existing.latest_created_at).getTime()) {
        existing.latest_created_at = row.created_at;
        existing.latest_invoice_number = row.invoice_number;
        existing.source_label = row.source_label;
      }
    }
    return [...grouped.values()].sort((a, b) => a.customer_name.localeCompare(b.customer_name));
  }, [pendingRows]);

  const selectedCustomerId = summary?.customer_id ?? "";
  const selectedCustomerIndex = useMemo(
    () => pendingCustomers.findIndex((row) => row.customer_id === selectedCustomerId),
    [pendingCustomers, selectedCustomerId]
  );
  const selectedReferenceIndex = useMemo(
    () => pendingOrders.findIndex((row) => row.sales_order_id === selectedOrderId),
    [pendingOrders, selectedOrderId]
  );
  const editableItemIds = useMemo(
    () => selectedOrder?.items.map((item) => item.sales_order_item_id) ?? [],
    [selectedOrder]
  );

  const totals = useMemo(() => {
    if (!selectedOrder) return { valueOfGoods: 0, discount: 0, final: 0 };
    return selectedOrder.items.reduce(
      (acc, item) => {
        const qty = Math.max(0, Math.min(item.quantity, Math.floor(Number(deliverQtyByItemId[item.sales_order_item_id] ?? item.quantity) || 0)));
        const lineValue = qty * item.unit_price;
        const lineFinal = qty * item.selling_price;
        acc.valueOfGoods += lineValue;
        acc.final += lineFinal;
        acc.discount += Math.max(0, lineValue - lineFinal);
        return acc;
      },
      { valueOfGoods: 0, discount: 0, final: 0 }
    );
  }, [deliverQtyByItemId, selectedOrder]);

  useEffect(() => {
    if (summary || pendingLoading || pendingCustomers.length === 0) {
      return;
    }
    void loadCustomerContext(pendingCustomers[0].customer_id);
  }, [loadCustomerContext, pendingCustomers, pendingLoading, summary]);

  const focusCustomerAt = useCallback((index: number) => {
    const row = pendingCustomers[index];
    if (!row) return;
    customerButtonRefs.current[row.customer_id]?.focus();
  }, [pendingCustomers]);

  const focusReferenceAt = useCallback((index: number) => {
    const row = pendingOrders[index];
    if (!row) return;
    referenceButtonRefs.current[row.sales_order_id]?.focus();
  }, [pendingOrders]);

  const focusQtyAt = useCallback((index: number) => {
    const itemId = editableItemIds[index];
    if (!itemId) return;
    setActiveItemId(itemId);
    qtyInputRefs.current[itemId]?.focus();
  }, [editableItemIds]);

  const focusCreateInvoice = useCallback(() => {
    createButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!selectedOrder) {
      setActiveItemId("");
      return;
    }
    setActiveItemId(
      selectedOrder.items.find((item) => !item.is_free_item)?.sales_order_item_id ??
        selectedOrder.items[0]?.sales_order_item_id ??
        ""
    );
  }, [selectedOrder]);

  useEffect(() => {
    if (!initialOrderId || initialHandledRef.current || pendingRows.length === 0) {
      return;
    }
    const row = pendingRows.find((item) => item.sales_order_id === initialOrderId);
    if (!row) {
      return;
    }
    initialHandledRef.current = true;
    void loadCustomerContext(row.customer_id, initialOrderId);
    onConsumedInitial?.();
  }, [initialOrderId, loadCustomerContext, onConsumedInitial, pendingRows]);

  async function createInlineCustomer() {
    if (!newCustomerForm.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    setCreatingCustomer(true);
    try {
      const payload = {
        name: newCustomerForm.name.trim(),
        outlet_name: newCustomerForm.name.trim(),
        gst_number: newCustomerForm.gstin.trim() || "",
        email: newCustomerForm.gstin.trim() ? `${newCustomerForm.gstin.trim().toLowerCase()}@placeholder.com` : "",
        phone: newCustomerForm.phone.trim() || null,
        gstin: newCustomerForm.gstin.trim() || null,
        street_address_1: newCustomerForm.street_address_1.trim() || null,
        city: newCustomerForm.city.trim() || null,
        state: newCustomerForm.state.trim() || null,
        pincode: newCustomerForm.pincode.trim() || null,
      };
      const created = await postBackend("/masters/customers", payload);
      toast.success(`Customer ${String(created?.name ?? payload.name)} created.`);
      setNewCustomerForm({
        name: "",
        phone: "",
        gstin: "",
        street_address_1: "",
        city: "",
        state: "",
        pincode: "",
      });
      setShowCustomerCreate(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create customer");
    } finally {
      setCreatingCustomer(false);
    }
  }

  async function createInvoice() {
    if (!canWriteSales || !selectedOrder) return;
    const items = selectedOrder.items
      .map((item) => ({
        sales_order_item_id: item.sales_order_item_id,
        quantity: Math.max(0, Math.min(item.quantity, Math.floor(Number(deliverQtyByItemId[item.sales_order_item_id] ?? item.quantity) || 0))),
      }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      toast.error("Enter at least one invoice quantity.");
      return;
    }
    if (dueDate < invoiceDate) {
      toast.error("Due date cannot be before invoice date.");
      return;
    }
    setCreating(true);
    try {
      await postBackend("/sales/sales-final-invoices/from-sales-order", {
        sales_order_id: selectedOrder.sales_order_id,
        invoice_date: invoiceDate,
        due_date: dueDate,
        items,
      });
      store.dispatch(
        invalidateByPrefixes([
          "/sales/sales-final-invoices",
          "/sales/sales-entry/pending-customers",
          `/sales/customers/${selectedOrder ? summary?.customer_id ?? "" : ""}/pending-sales-orders`,
        ])
      );
      toast.success("Sales invoice created.");
      await loadPendingRows(pendingSearch);
      if (summary?.customer_id) {
        await loadCustomerContext(summary.customer_id);
      }
      if (summary?.customer_id) {
        const refreshedRows = asArray(await fetchBackendFresh(`/sales/customers/${summary.customer_id}/pending-sales-orders`));
        if (refreshedRows.length === 0) {
          const refreshedPending = asArray(await fetchBackendFresh(`/sales/sales-entry/pending-customers`)).map((row) => ({
            customer_id: String(row.customer_id ?? ""),
          }));
          const nextCustomerId = refreshedPending.find((row) => row.customer_id !== summary.customer_id)?.customer_id ?? "";
          if (nextCustomerId) {
            await loadCustomerContext(nextCustomerId);
          } else {
            setPendingOrders([]);
            setSummary(null);
            setSelectedOrderId("");
          }
        }
      }
      onCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create sales invoice");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="overflow-hidden border border-[#6f8f87] bg-[#f4f8f4] shadow-[0_0_0_1px_rgba(76,104,96,0.08)]">
      <div className="grid grid-cols-[1fr_380px]">
        <div className="border-r border-[#cdd7d1]">
          <div className="border-b border-[#cdd7d1] bg-[#73958b] px-5 py-3 font-mono text-[30px] tracking-[0.32em] text-white">
            SALES ENTRY CONSOLE
          </div>
          <div className="grid grid-cols-[1.3fr_1fr_220px] border-b border-[#d6dfd8] text-[#1c2f28]">
            <div className="border-r border-[#d6dfd8] px-5 py-4">
              <div className="mb-1 font-mono text-[13px] tracking-[0.34em] text-[#65746c]">NAME</div>
              <div className="text-[21px] font-semibold uppercase leading-tight">
                {summary?.customer_name ?? "Select pending challan"}
              </div>
              <div className="mt-2 space-y-1 font-mono text-[15px] text-[#5a645f]">
                {(summary?.address_lines ?? []).slice(0, 2).map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            </div>
            <div className="border-r border-[#d6dfd8] px-5 py-4">
              <div className="mb-1 font-mono text-[13px] tracking-[0.34em] text-[#65746c]">BILL NO</div>
              <div className="text-[21px] font-semibold">{selectedOrder?.invoice_number ?? "-"}</div>
              <div className="mt-2 font-mono text-[15px] text-[#5a645f]">
                <div>Warehouse: {selectedOrder?.warehouse_name ?? "-"}</div>
                <div>MR / Source: {selectedOrder?.source_label ?? "-"}</div>
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="mb-1 font-mono text-[13px] tracking-[0.34em] text-[#65746c]">DATE</div>
              <Input
                ref={invoiceDateRef}
                type="date"
                value={invoiceDate}
                onChange={(e) => applyInvoiceDate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "ArrowDown") {
                    e.preventDefault();
                    focusCustomerAt(Math.max(selectedCustomerIndex, 0));
                  }
                }}
                className="h-11 rounded-none border-[#ccd8d1] bg-[#eef4ed] font-mono text-lg shadow-none"
              />
              <div className="mt-2 grid grid-cols-[1fr_90px] gap-2">
                <Input
                  type="date"
                  min={invoiceDate}
                  value={dueDate}
                  onChange={(e) => applyDueDate(e.target.value)}
                  className="h-9 rounded-none border-[#ccd8d1] bg-[#eef4ed] font-mono text-sm shadow-none"
                  aria-label="Due date"
                />
                <Input
                  inputMode="numeric"
                  value={dueDays}
                  onChange={(e) => applyDueDays(e.target.value)}
                  className="h-9 rounded-none border-[#ccd8d1] bg-[#eef4ed] font-mono text-sm shadow-none"
                  aria-label="Due days"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-[1fr_360px] border-b border-[#d6dfd8]">
            <div className="border-r border-[#d6dfd8] px-5 py-4">
              <div className="mb-3 font-mono text-[20px] tracking-[0.28em] text-[#67766e]">REFERENCES</div>
              {!summaryLoading && pendingOrders.length === 0 ? (
                <div className="font-mono text-[#6d7972]">No pending challans for selected customer.</div>
              ) : (
                <div className="grid gap-2">
                  {pendingOrders.map((order) => {
                    const selected = order.sales_order_id === selectedOrderId;
                    const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <button
                        key={order.sales_order_id}
                        type="button"
                        onClick={() => setSelectedOrderId(order.sales_order_id)}
                        ref={(node) => {
                          referenceButtonRefs.current[order.sales_order_id] = node;
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            focusReferenceAt(Math.min(selectedReferenceIndex + 1, pendingOrders.length - 1));
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            focusReferenceAt(Math.max(selectedReferenceIndex - 1, 0));
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setSelectedOrderId(order.sales_order_id);
                            window.setTimeout(() => focusQtyAt(0), 0);
                            return;
                          }
                          if (e.key === "ArrowLeft") {
                            e.preventDefault();
                            focusCustomerAt(Math.max(selectedCustomerIndex, 0));
                            return;
                          }
                          if (e.key === "ArrowRight") {
                            e.preventDefault();
                            setSelectedOrderId(order.sales_order_id);
                            window.setTimeout(() => focusQtyAt(0), 0);
                          }
                        }}
                        className={`grid grid-cols-[1.3fr_100px_120px_90px] items-center border px-3 py-2 text-left font-mono text-sm ${
                          selected
                            ? "border-[#244c40] bg-[#d8e7df] text-[#10211b] shadow-[inset_0_0_0_1px_#244c40]"
                            : "border-[#d6dfd8] bg-[#fbfdfb] text-[#51615a]"
                        }`}
                      >
                        <span className="font-semibold">{order.invoice_number || "-"}</span>
                        <span>{formatDate(order.created_at)}</span>
                        <span>{order.source_label}</span>
                        <span>{Math.floor(totalQty)} qty</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-[#f7fbff] px-5 py-4">
              <div className="mb-2 font-mono text-[20px] tracking-[0.28em] text-[#5f788c]">CUSTOMER STATUS</div>
              {summaryLoading ? (
                <div className="font-mono text-[#6d7972]">Loading...</div>
              ) : !summary ? (
                <div className="font-mono text-[#6d7972]">Select a customer to view history.</div>
              ) : (
                <div className="space-y-2 font-mono text-[15px] text-[#2f4657]">
                  <div className="flex justify-between"><span>SALE-Anu</span><span>{formatMoney(summary.annual_sales_amount)}</span></div>
                  <div className="flex justify-between"><span>SALE-Mon</span><span>{formatMoney(summary.monthly_sales_amount)}</span></div>
                  <div className="flex justify-between"><span>Balance</span><span>{formatMoney(summary.balance)} {summary.balance_side}</span></div>
                  <div className="flex justify-between"><span>Last Sale</span><span>{formatDate(summary.last_sale_date)}</span></div>
                  <div className="flex justify-between"><span>Last Receipt</span><span>{formatDate(summary.last_receipt_date)}</span></div>
                  <div className="flex justify-between"><span>Route</span><span>{summary.route_name ?? "-"}</span></div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-[1fr_360px]">
            <div className="border-r border-[#d6dfd8]">
              <div className="grid grid-cols-[44%_10%_10%_10%_12%_14%] border-b border-[#d6dfd8] bg-[#dfe9bb] px-5 py-3 font-mono text-[18px] font-semibold text-[#1d2d25]">
                <div>PRODUCT</div>
                <div>UNIT</div>
                <div>QTY</div>
                <div>FREE</div>
                <div>RATE</div>
                <div>AMOUNT</div>
              </div>
              <div className="min-h-[420px]">
                {!selectedOrder ? (
                  <div className="px-5 py-8 font-mono text-lg text-[#6d7972]">Select a pending challan from the right side.</div>
                ) : (
                  selectedOrder.items.map((item, index) => {
                    const qty = Math.max(0, Math.min(item.quantity, Math.floor(Number(deliverQtyByItemId[item.sales_order_item_id] ?? item.quantity) || 0)));
                    const amount = qty * item.selling_price;
                    return (
                      <div
                        key={item.sales_order_item_id}
                        className={`grid grid-cols-[44%_10%_10%_10%_12%_14%] border-b border-[#e1e8e2] px-5 py-3 font-mono text-[17px] ${
                          activeItemId === item.sales_order_item_id
                            ? "bg-[#dce9f3]"
                            : index % 2 === 0
                              ? "bg-white"
                              : "bg-[#fbfdfb]"
                        }`}
                      >
                        <div className="pr-4">
                          <div className="font-semibold">{item.product_name}</div>
                          <div className="text-sm text-[#6d7972]">
                            {item.sku}
                            {item.is_free_item ? " · SCHEME FREE" : item.discount_percent > 0 ? ` · ${item.discount_percent}% off` : ""}
                          </div>
                        </div>
                        <div>{item.unit}</div>
                        <div>
                          {!item.is_free_item ? (
                            <Input
                              inputMode="numeric"
                              value={String(qty)}
                              disabled={!canWriteSales}
                              ref={(node) => {
                                qtyInputRefs.current[item.sales_order_item_id] = node;
                              }}
                              onFocus={() => setActiveItemId(item.sales_order_item_id)}
                              onChange={(e) => {
                                const next = e.target.value.replace(/\D/g, "");
                                setDeliverQtyByItemId((prev) => ({ ...prev, [item.sales_order_item_id]: next }));
                              }}
                              onKeyDown={(e) => {
                                const itemIndex = editableItemIds.indexOf(item.sales_order_item_id);
                                if (e.key === "Enter" || e.key === "ArrowDown") {
                                  e.preventDefault();
                                  if (itemIndex < editableItemIds.length - 1) {
                                    focusQtyAt(itemIndex + 1);
                                  } else {
                                    focusCreateInvoice();
                                  }
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (itemIndex > 0) {
                                    focusQtyAt(itemIndex - 1);
                                  } else {
                                    focusReferenceAt(Math.max(selectedReferenceIndex, 0));
                                  }
                                }
                              }}
                              className="h-9 rounded-none border-[#d6dfd8] bg-[#eef4ed] font-mono shadow-none"
                            />
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                        <div>
                          {item.is_free_item ? (
                            <Input
                              inputMode="numeric"
                              value={String(qty)}
                              disabled={!canWriteSales}
                              ref={(node) => {
                                qtyInputRefs.current[item.sales_order_item_id] = node;
                              }}
                              onFocus={() => setActiveItemId(item.sales_order_item_id)}
                              onChange={(e) => {
                                const next = e.target.value.replace(/\D/g, "");
                                setDeliverQtyByItemId((prev) => ({ ...prev, [item.sales_order_item_id]: next }));
                              }}
                              onKeyDown={(e) => {
                                const itemIndex = editableItemIds.indexOf(item.sales_order_item_id);
                                if (e.key === "Enter" || e.key === "ArrowDown") {
                                  e.preventDefault();
                                  if (itemIndex < editableItemIds.length - 1) {
                                    focusQtyAt(itemIndex + 1);
                                  } else {
                                    focusCreateInvoice();
                                  }
                                  return;
                                }
                                if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  if (itemIndex > 0) {
                                    focusQtyAt(itemIndex - 1);
                                  } else {
                                    focusReferenceAt(Math.max(selectedReferenceIndex, 0));
                                  }
                                }
                              }}
                              className="h-9 rounded-none border-[#d6dfd8] bg-[#eef4ed] font-mono shadow-none"
                            />
                          ) : (
                            <span>-</span>
                          )}
                        </div>
                        <div>{formatMoney(item.selling_price)}</div>
                        <div>{formatMoney(amount)}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="border-l-0">
              <div className="border-b border-[#d6dfd8] bg-[#f7fbff] px-5 py-4">
                <div className="mb-2 font-mono text-[20px] tracking-[0.28em] text-[#5f788c]">PARTY HISTORY</div>
                {summaryLoading ? (
                  <div className="font-mono text-[#6d7972]">Loading...</div>
                ) : !summary ? (
                  <div className="font-mono text-[#6d7972]">Select a customer to view history.</div>
                ) : (
                  <div className="space-y-2 font-mono text-[16px] text-[#2f4657]">
                    <div className="flex justify-between"><span>SALE-Anu</span><span>{formatMoney(summary.annual_sales_amount)}</span></div>
                    <div className="flex justify-between"><span>SALE-Mon</span><span>{formatMoney(summary.monthly_sales_amount)}</span></div>
                    <div className="flex justify-between"><span>Balance</span><span>{formatMoney(summary.balance)} {summary.balance_side}</span></div>
                    <div className="flex justify-between"><span>Last Sale</span><span>{formatDate(summary.last_sale_date)}</span></div>
                    <div className="flex justify-between"><span>Last Receipt</span><span>{formatDate(summary.last_receipt_date)}</span></div>
                    <div className="flex justify-between"><span>GSTIN</span><span>{summary.gstin ?? "-"}</span></div>
                    <div className="flex justify-between"><span>Phone</span><span>{summary.phone ?? "-"}</span></div>
                  </div>
                )}
              </div>
              <div className="border-b border-[#d6dfd8] bg-[#f7fbff] px-5 py-4">
                <div className="mb-2 font-mono text-[20px] tracking-[0.28em] text-[#5f788c]">LAST BILLS</div>
                <div className="space-y-2 font-mono text-[15px] text-[#2f4657]">
                  {(summary?.recent_invoices ?? []).slice(0, 6).map((item) => (
                    <div key={`${item.invoice_number}-${item.invoice_date}`} className="flex justify-between gap-3">
                      <span className="truncate">{item.invoice_number}</span>
                      <span>{formatDate(item.invoice_date)}</span>
                      <span>{formatMoney(item.total_amount)}</span>
                    </div>
                  ))}
                  {summary && summary.recent_invoices.length === 0 ? <div className="text-[#6d7972]">No previous invoices.</div> : null}
                </div>
              </div>
              <div className="border-b border-[#d6dfd8] bg-[#f7fbff] px-5 py-4">
                <div className="mb-2 font-mono text-[20px] tracking-[0.28em] text-[#5f788c]">LAST RECEIPTS</div>
                <div className="space-y-2 font-mono text-[15px] text-[#2f4657]">
                  {(summary?.recent_receipts ?? []).slice(0, 6).map((item) => (
                    <div key={`${item.payment_date}-${item.amount}-${item.mode ?? ""}`} className="flex justify-between gap-3">
                      <span className="truncate">{item.mode ?? "Receipt"}</span>
                      <span>{formatDate(item.payment_date)}</span>
                      <span>{formatMoney(item.amount)}</span>
                    </div>
                  ))}
                  {summary && summary.recent_receipts.length === 0 ? <div className="text-[#6d7972]">No recent receipts.</div> : null}
                </div>
              </div>
              <div className="bg-[#f7fbff] px-5 py-4">
                <div className="mb-2 font-mono text-[20px] tracking-[0.28em] text-[#5f788c]">TOTALS</div>
                <div className="space-y-2 font-mono text-[18px] text-[#2f4657]">
                  <div className="flex justify-between"><span>VALUE OF GOODS</span><span>{formatMoney(totals.valueOfGoods)}</span></div>
                  <div className="flex justify-between"><span>DISCOUNT</span><span>{formatMoney(totals.discount)}</span></div>
                  <div className="flex justify-between border-t border-[#d6dfd8] pt-3 text-[28px] font-semibold text-[#1a2d3d]"><span>FINAL BILL</span><span>{formatMoney(totals.final)}</span></div>
                </div>
                <Button
                  ref={createButtonRef}
                  className="mt-4 h-12 w-full rounded-none font-mono text-lg"
                  disabled={!canWriteSales || !selectedOrder || creating}
                  onClick={() => void createInvoice()}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      focusQtyAt(Math.max(editableItemIds.length - 1, 0));
                    }
                  }}
                >
                  {creating ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#f4f8ff]">
          <div className="border-b border-[#cdd7d1] bg-[#73958b] px-4 py-3 font-mono text-lg tracking-[0.25em] text-white">
            <div className="flex items-center justify-between gap-3">
              <span>PENDING CUSTOMERS</span>
              <Button size="sm" variant="outline" onClick={() => setShowCustomerCreate(true)}>
                + Add Customer
              </Button>
            </div>
          </div>
          <div className="border-b border-[#d6dfd8] p-3">
            <Input
              ref={pendingSearchRef}
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "Enter") {
                  e.preventDefault();
                  focusCustomerAt(Math.max(selectedCustomerIndex, 0));
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  invoiceDateRef.current?.focus();
                }
              }}
              placeholder="Search customer or ref"
              className="h-11 rounded-none border-[#cad5e0] bg-white font-mono shadow-none"
            />
          </div>
          <div className="max-h-[760px] overflow-y-auto">
            {pendingLoading ? (
              <div className="px-4 py-6 font-mono text-[#6d7972]">Loading pending customers...</div>
            ) : pendingCustomers.length === 0 ? (
              <div className="px-4 py-6 font-mono text-[#6d7972]">No pending challans found.</div>
            ) : (
              pendingCustomers.map((row) => {
                const selected = summary?.customer_id === row.customer_id;
                return (
                  <button
                    key={row.customer_id}
                    type="button"
                    onClick={() => {
                      void loadCustomerContext(row.customer_id);
                    }}
                    ref={(node) => {
                      customerButtonRefs.current[row.customer_id] = node;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        focusCustomerAt(Math.min(selectedCustomerIndex + 1, pendingCustomers.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        focusCustomerAt(Math.max(selectedCustomerIndex - 1, 0));
                        return;
                      }
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void loadCustomerContext(row.customer_id);
                        window.setTimeout(() => focusReferenceAt(0), 0);
                        return;
                      }
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        pendingSearchRef.current?.focus();
                      }
                    }}
                    className={`block w-full border-b border-[#dce5ee] px-4 py-3 text-left font-mono ${selected ? "bg-[#dbe7f0]" : "bg-[#f9fbff] hover:bg-[#eef4fb]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[#29435a]">{row.customer_name}</div>
                        <div className="text-[15px] text-[#5b7081]">{row.latest_invoice_number || "-"}</div>
                      </div>
                      <div className="bg-[#dfe9bb] px-2 py-1 text-xs font-semibold text-[#2a3b32]">
                        {row.challan_count} challan{row.challan_count === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="mt-1 text-sm text-[#6d7972]">{formatDate(row.latest_created_at)} · {row.source_label}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
      <Dialog open={showCustomerCreate} onOpenChange={setShowCustomerCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label>Customer Name *</Label>
              <Input value={newCustomerForm.name} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={newCustomerForm.phone} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>GSTIN</Label>
              <Input value={newCustomerForm.gstin} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, gstin: e.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Street</Label>
              <Input value={newCustomerForm.street_address_1} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, street_address_1: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={newCustomerForm.city} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, city: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>State</Label>
              <Input value={newCustomerForm.state} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, state: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Pincode</Label>
              <Input value={newCustomerForm.pincode} onChange={(e) => setNewCustomerForm((prev) => ({ ...prev, pincode: e.target.value }))} />
            </div>
          </div>
          <div className="pt-2">
            <Button onClick={createInlineCustomer} disabled={creatingCustomer || !newCustomerForm.name.trim()}>
              {creatingCustomer ? "Adding..." : "Add Customer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
