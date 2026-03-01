"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, postBackend } from "@/lib/backend-api";
import { invalidateByPrefixes } from "@/lib/state/api-cache-slice";
import { usePersistedPage, usePersistedUiState } from "@/lib/state/pagination-hooks";
import { store } from "@/lib/state/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type CustomerOption = {
  id: string;
  name: string;
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
};

type PendingOrder = {
  sales_order_id: string;
  invoice_number: string;
  warehouse_id: string;
  warehouse_name: string;
  source: string;
  status: string;
  created_at: string;
  items: PendingOrderItem[];
};

type FinalInvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  total_amount: string;
  status: string;
  delivery_status: string;
  item_count: number;
  created_at: string;
};

const DEFAULT_PAGE_SIZE = 50;
const defaultUiState = {
  tab: "create",
  customerSearchInput: "",
  selectedCustomerId: "",
  selectedCustomerName: "",
  selectedOrderId: "",
  invoiceDate: new Date().toISOString().slice(0, 10),
  invoiceSearchInput: "",
  invoiceSearch: "",
};

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string): string {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "-";
  }
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPrice(value: string | number): string {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

export function SalesInvoicesAdminEditor() {
  const { state: persistedUiState, setState: setPersistedUiState } = usePersistedUiState(
    "sales-invoices-admin-ui",
    defaultUiState
  );
  const [tab, setTab] = useState(persistedUiState.tab);
  const [customerSearchInput, setCustomerSearchInput] = useState(persistedUiState.customerSearchInput);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(
    persistedUiState.selectedCustomerId
      ? { id: persistedUiState.selectedCustomerId, name: persistedUiState.selectedCustomerName || "Customer" }
      : null
  );
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(persistedUiState.selectedOrderId);
  const [deliverQtyByItemId, setDeliverQtyByItemId] = useState<Record<string, number>>({});
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [createFeedback, setCreateFeedback] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(persistedUiState.invoiceDate);

  const [invoiceRows, setInvoiceRows] = useState<FinalInvoiceRow[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(true);
  const [invoiceFeedback, setInvoiceFeedback] = useState("");
  const [invoiceSearchInput, setInvoiceSearchInput] = useState(persistedUiState.invoiceSearchInput);
  const [invoiceSearch, setInvoiceSearch] = useState(persistedUiState.invoiceSearch);
  const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(0);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "sales-final-invoices-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  useEffect(() => {
    setPersistedUiState({
      tab,
      customerSearchInput,
      selectedCustomerId: selectedCustomer?.id ?? "",
      selectedCustomerName: selectedCustomer?.name ?? "",
      selectedOrderId,
      invoiceDate,
      invoiceSearchInput,
      invoiceSearch,
    });
  }, [
    customerSearchInput,
    invoiceDate,
    invoiceSearch,
    invoiceSearchInput,
    selectedCustomer,
    selectedOrderId,
    setPersistedUiState,
    tab,
  ]);

  useEffect(() => {
    if (persistedUiState.selectedCustomerId && !pendingOrders.length && !pendingLoading) {
      void loadPendingOrders(persistedUiState.selectedCustomerId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function searchCustomers(term: string) {
    setCustomerLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", "50");
      params.set("search", term.trim());
      const response = asObject(await fetchBackend(`/masters/customers?${params.toString()}`));
      const items = asArray(response.items).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? row.outlet_name ?? "Customer"),
      }));
      setCustomerOptions(items);
    } catch {
      setCustomerOptions([]);
    } finally {
      setCustomerLoading(false);
    }
  }

  useEffect(() => {
    const term = customerSearchInput.trim();
    if (!term) {
      setCustomerOptions([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void searchCustomers(term);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [customerSearchInput]);

  async function loadPendingOrders(customerId: string) {
    setPendingLoading(true);
    setCreateFeedback("");
    try {
      const rows = asArray(await fetchBackend(`/sales/customers/${customerId}/pending-sales-orders`)).map((row) => ({
        sales_order_id: String(row.sales_order_id ?? ""),
        invoice_number: String(row.invoice_number ?? "-"),
        warehouse_id: String(row.warehouse_id ?? ""),
        warehouse_name: String(row.warehouse_name ?? "-"),
        source: String(row.source ?? "-"),
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
        })),
      }));
      setPendingOrders(rows);
      setSelectedOrderId((prev) => {
        const preferred = prev || persistedUiState.selectedOrderId;
        return rows.some((row) => row.sales_order_id === preferred) ? preferred : rows[0]?.sales_order_id || "";
      });
      const nextDrafts: Record<string, number> = {};
      for (const row of rows) {
        for (const item of row.items) {
          nextDrafts[item.sales_order_item_id] = Math.max(0, Math.floor(item.quantity));
        }
      }
      setDeliverQtyByItemId(nextDrafts);
    } catch (error) {
      setPendingOrders([]);
      setSelectedOrderId("");
      setDeliverQtyByItemId({});
      setCreateFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setPendingLoading(false);
    }
  }

  const selectedOrder = useMemo(
    () => pendingOrders.find((row) => row.sales_order_id === selectedOrderId) ?? null,
    [pendingOrders, selectedOrderId]
  );

  function setDeliverQty(itemId: string, next: number, max: number) {
    const clamped = Math.max(0, Math.min(Math.floor(max), Math.floor(Number.isFinite(next) ? next : 0)));
    setDeliverQtyByItemId((prev) => ({ ...prev, [itemId]: clamped }));
  }

  async function createInvoice() {
    if (!selectedOrder) {
      toast.error("Select a sales order first.");
      return;
    }
    const items = selectedOrder.items
      .map((item) => ({
        sales_order_item_id: item.sales_order_item_id,
        quantity: Math.max(0, Math.min(item.quantity, Math.floor(deliverQtyByItemId[item.sales_order_item_id] ?? 0))),
      }))
      .filter((item) => item.quantity > 0);
    if (items.length === 0) {
      toast.error("Enter at least one delivery quantity.");
      return;
    }

    setCreatingInvoice(true);
    setCreateFeedback("");
    try {
      await postBackend("/sales/sales-final-invoices/from-sales-order", {
        sales_order_id: selectedOrder.sales_order_id,
        invoice_date: invoiceDate,
        items,
      });
      store.dispatch(
        invalidateByPrefixes([
          "/sales/sales-orders",
          "/sales/sales-final-invoices",
          `/sales/customers/${selectedCustomer?.id ?? ""}/pending-sales-orders`,
        ])
      );
      toast.success("Sales invoice created successfully.");
      if (selectedCustomer) {
        await loadPendingOrders(selectedCustomer.id);
      }
      setCurrentPage(1);
      await loadInvoices(1, invoiceSearch, pageSize);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setCreateFeedback(`Invoice creation failed: ${message}`);
      toast.error(`Invoice creation failed: ${message}`);
    } finally {
      setCreatingInvoice(false);
    }
  }

  async function loadInvoices(page: number, searchText: string, size = pageSize) {
    setInvoiceLoading(true);
    setInvoiceFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(size));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/sales/sales-final-invoices?${params.toString()}`));
      const items = asArray(response.items).map((row) => ({
        id: String(row.id ?? ""),
        invoice_number: String(row.invoice_number ?? "-"),
        invoice_date: String(row.invoice_date ?? ""),
        customer_name: String(row.customer_name ?? "-"),
        total_amount: String(row.total_amount ?? "0"),
        status: String(row.status ?? "-"),
        delivery_status: String(row.delivery_status ?? "-"),
        item_count: toNumber(row.item_count),
        created_at: String(row.created_at ?? ""),
      }));
      setInvoiceRows(items);
      setInvoiceTotalCount(toNumber(response.total));
      setInvoiceTotalPages(toNumber(response.total_pages));
      setSelectedInvoiceIds([]);
    } catch (error) {
      setInvoiceRows([]);
      setInvoiceTotalCount(0);
      setInvoiceTotalPages(0);
      setInvoiceFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setInvoiceLoading(false);
    }
  }

  useEffect(() => {
    void loadInvoices(currentPage, invoiceSearch, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, invoiceSearch]);

  const allInvoicesSelected = invoiceRows.length > 0 && selectedInvoiceIds.length === invoiceRows.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Invoices</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="create">Create Invoice</TabsTrigger>
            <TabsTrigger value="invoices">Sales Invoices</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4">
            {createFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{createFeedback}</p> : null}
            <div className="space-y-2">
              <Label>Customer Search</Label>
              <Input
                value={customerSearchInput}
                onChange={(e) => setCustomerSearchInput(e.target.value)}
                placeholder="Type customer name"
              />
              {customerLoading ? <p className="text-xs text-muted-foreground">Searching customers...</p> : null}
              {customerOptions.length > 0 ? (
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  {customerOptions.map((customer) => (
                    <button
                      key={customer.id}
                      type="button"
                      className="block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/40"
                      onClick={() => {
                        setSelectedCustomer(customer);
                        setCustomerSearchInput(customer.name);
                        setCustomerOptions([]);
                        void loadPendingOrders(customer.id);
                      }}
                    >
                      {customer.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {selectedCustomer ? (
              <div className="space-y-4 rounded-md border p-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Selected Customer</p>
                  <p className="font-medium">{selectedCustomer.name}</p>
                </div>

                {pendingLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={`pending-order-${index}`} className="h-10 w-full" />
                    ))}
                  </div>
                ) : pendingOrders.length === 0 ? (
                  <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No pending sales orders for this customer.</p>
                ) : (
                  <>
                    {pendingOrders.length > 1 ? (
                      <div className="space-y-1">
                        <Label>Sales Order</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={selectedOrderId}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                        >
                          {pendingOrders.map((order) => (
                            <option key={order.sales_order_id} value={order.sales_order_id}>
                              {(order.invoice_number || "-") + " | " + order.warehouse_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {selectedOrder ? (
                      <div className="space-y-3">
                        <div className="rounded-md border p-3 text-sm text-muted-foreground">
                          <p>
                            Sales Order: <span className="font-medium text-foreground">{selectedOrder.invoice_number || "-"}</span>
                          </p>
                          <p>
                            Warehouse: <span className="font-medium text-foreground">{selectedOrder.warehouse_name}</span>
                          </p>
                          <p>
                            Created: <span className="font-medium text-foreground">{formatDate(selectedOrder.created_at)}</span>
                          </p>
                        </div>

                        <div className="overflow-hidden rounded-lg border">
                          <Table className="w-full table-fixed">
                            <TableHeader>
                              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                                <TableHead className="w-[18%] uppercase tracking-wide text-slate-600 dark:text-slate-300">SKU</TableHead>
                                <TableHead className="w-[34%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Product</TableHead>
                                <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Unit</TableHead>
                                <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Ordered</TableHead>
                                <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Deliver</TableHead>
                                <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Price</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedOrder.items.map((item, index) => (
                                <TableRow key={item.sales_order_item_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                                  <TableCell className="truncate" title={item.sku}>{item.sku}</TableCell>
                                  <TableCell className="truncate" title={item.product_name}>{item.product_name}</TableCell>
                                  <TableCell>{item.unit}</TableCell>
                                  <TableCell>{item.quantity}</TableCell>
                                  <TableCell>
                                    <Input
                                      type="number"
                                      min={0}
                                      max={item.quantity}
                                      className="h-9"
                                      value={String(deliverQtyByItemId[item.sales_order_item_id] ?? item.quantity)}
                                      onChange={(e) => setDeliverQty(item.sales_order_item_id, Number(e.target.value), item.quantity)}
                                    />
                                  </TableCell>
                                  <TableCell>{formatPrice(item.selling_price || item.unit_price)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row md:items-end">
                          <div className="space-y-1">
                            <Label>Invoice Date</Label>
                            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                          </div>
                          <Button onClick={() => void createInvoice()} disabled={creatingInvoice}>
                            {creatingInvoice ? "Creating..." : "Create Invoice"}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="invoices" className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Input
                placeholder="Search invoice or customer"
                value={invoiceSearchInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setInvoiceSearchInput(value);
                  if (value.trim() === "" && invoiceSearch !== "") {
                    resetPage();
                    setInvoiceSearch("");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    resetPage();
                    setInvoiceSearch(invoiceSearchInput.trim());
                  }
                }}
              />
              <Button
                onClick={() => {
                  resetPage();
                  setInvoiceSearch(invoiceSearchInput.trim());
                }}
                disabled={invoiceLoading}
              >
                Search
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setInvoiceSearchInput("");
                  resetPage();
                  setInvoiceSearch("");
                }}
              >
                Reset
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">Selected rows: {selectedInvoiceIds.length}</p>
            {invoiceFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{invoiceFeedback}</p> : null}

            <div className="overflow-hidden rounded-lg border">
              <Table className="w-full table-fixed">
                <TableHeader>
                  <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        checked={allInvoicesSelected}
                        onChange={(e) => setSelectedInvoiceIds(e.target.checked ? invoiceRows.map((row) => row.id) : [])}
                      />
                    </TableHead>
                    <TableHead className="w-[18%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Invoice</TableHead>
                    <TableHead className="w-[18%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Customer</TableHead>
                    <TableHead className="w-[10%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Items</TableHead>
                    <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Total</TableHead>
                    <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</TableHead>
                    <TableHead className="w-[14%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Delivery</TableHead>
                    <TableHead className="w-[16%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoiceLoading
                    ? Array.from({ length: 8 }).map((_, index) => (
                        <TableRow key={`invoice-skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                          <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-14 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                        </TableRow>
                      ))
                    : null}
                  {!invoiceLoading && invoiceRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No sales invoices found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!invoiceLoading &&
                    invoiceRows.map((row, index) => (
                      <TableRow key={row.id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedInvoiceIds.includes(row.id)}
                            onChange={(e) =>
                              setSelectedInvoiceIds((prev) =>
                                e.target.checked ? [...new Set([...prev, row.id])] : prev.filter((id) => id !== row.id)
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="truncate" title={row.invoice_number}>{row.invoice_number}</TableCell>
                        <TableCell className="truncate" title={row.customer_name}>{row.customer_name}</TableCell>
                        <TableCell>{row.item_count}</TableCell>
                        <TableCell>{formatPrice(row.total_amount)}</TableCell>
                        <TableCell className="truncate" title={row.status}>{row.status}</TableCell>
                        <TableCell className="truncate" title={row.delivery_status}>{row.delivery_status}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.created_at || row.invoice_date)}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>

            {invoiceTotalCount > 50 ? (
              <PaginationFooter
                loading={invoiceLoading}
                page={currentPage}
                totalPages={invoiceTotalPages}
                totalItems={invoiceTotalCount}
                pageSize={pageSize}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setCurrentPage(1);
                }}
                onFirst={() => setCurrentPage(1)}
                onPrevious={() => setCurrentPage((page) => page - 1)}
                onNext={() => setCurrentPage((page) => page + 1)}
                onLast={() => setCurrentPage(invoiceTotalPages)}
              />
            ) : null}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
