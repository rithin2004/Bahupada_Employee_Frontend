"use client";

import { useEffect, useMemo, useState } from "react";
import { ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, logFrontendViewLatency, nowMs, postBackend } from "@/lib/backend-api";
import { invalidateByPrefixes } from "@/lib/state/api-cache-slice";
import { store } from "@/lib/state/store";
import { usePersistedPage } from "@/lib/state/pagination-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type SalesOrderRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  warehouse_name: string;
  source: string;
  status: string;
  item_count: string;
  created_at: string;
};

type SalesOrderItemRow = {
  id: string;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  quantity: string;
  unit_price: string;
};

type CustomerOption = {
  id: string;
  name: string;
};

type CreateStockRow = {
  batch_id: string;
  product_id: string;
  warehouse_id: string;
  sku: string;
  product_name: string;
  warehouse_name: string;
  unit: string;
  batch_no: string;
  base_price: number;
  available_quantity: number;
};

type ProductSearchRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  base_price: number;
};

type CartItem = CreateStockRow & {
  quantity: number;
};

const DEFAULT_PAGE_SIZE = 50;

function mapRow(row: Record<string, unknown>): SalesOrderRow {
  return {
    id: String(row.id ?? ""),
    invoice_number: String(row.invoice_number ?? "-"),
    customer_name: String(row.customer_name ?? "-"),
    warehouse_name: String(row.warehouse_name ?? "-"),
    source: String(row.source ?? "-"),
    status: String(row.status ?? "-"),
    item_count: String(row.item_count ?? "0"),
    created_at: String(row.created_at ?? ""),
  };
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

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function SalesOrdersAdminEditor() {
  const [rows, setRows] = useState<SalesOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewOrder, setViewOrder] = useState<SalesOrderRow | null>(null);
  const [orderItems, setOrderItems] = useState<SalesOrderItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsFeedback, setItemsFeedback] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [createFeedback, setCreateFeedback] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [stockRows, setStockRows] = useState<CreateStockRow[]>([]);
  const [stockSearchInput, setStockSearchInput] = useState("");
  const [draftQtyByBatch, setDraftQtyByBatch] = useState<Record<string, number>>({});
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pendingViewLatency, setPendingViewLatency] = useState<{
    label: string;
    startedAt: number;
    rows: number;
    page: number;
  } | null>(null);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "sales-orders-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  async function loadPage(page: number, searchText: string, size = pageSize) {
    const startedAt = nowMs();
    setLoading(true);
    setFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(size));
      if (refreshKey) {
        params.set("_", String(refreshKey));
      }
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/sales/sales-orders?${params.toString()}`));
      const items = asArray(response.items).map(mapRow);
      setRows(items);
      setTotalCount(Number(response.total ?? items.length));
      setTotalPages(Number(response.total_pages ?? 0));
      setCurrentPage(Number(response.page ?? page));
      setSelectedIds([]);
      setPendingViewLatency({
        label: `/sales/sales-orders?page=${page}&page_size=${size}`,
        startedAt,
        rows: items.length,
        page,
      });
    } catch (error) {
      setRows([]);
      setTotalCount(0);
      setTotalPages(0);
      resetPage();
      setFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setPendingViewLatency({
        label: `/sales/sales-orders?page=${page}&page_size=${size}:error`,
        startedAt,
        rows: 0,
        page,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loading || !pendingViewLatency) {
      return;
    }
    const handle = window.requestAnimationFrame(() => {
      logFrontendViewLatency("sales-orders-admin-table", pendingViewLatency.startedAt, {
        request: pendingViewLatency.label,
        rows: pendingViewLatency.rows,
        page: pendingViewLatency.page,
      });
      setPendingViewLatency(null);
    });
    return () => window.cancelAnimationFrame(handle);
  }, [loading, pendingViewLatency]);

  useEffect(() => {
    void loadPage(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, search, refreshKey]);

  function onSearch() {
    resetPage();
    setSearch(searchInput.trim());
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((value) => value !== id)));
  }

  const selectedCount = useMemo(() => selectedIds.length, [selectedIds.length]);

  async function openViewDialog(row: SalesOrderRow) {
    setViewOrder(row);
    setOrderItems([]);
    setItemsFeedback("");
    setItemsLoading(true);
    try {
      const response = asObject(await fetchBackend(`/sales/sales-orders/${row.id}/items`));
      const items = asArray(response.items).map((item) => ({
        id: String(item.id ?? ""),
        product_id: String(item.product_id ?? ""),
        sku: String(item.sku ?? "-"),
        product_name: String(item.product_name ?? "-"),
        unit: String(item.unit ?? "-"),
        quantity: String(item.quantity ?? "0"),
        unit_price: String(item.unit_price ?? "0"),
      }));
      setOrderItems(items);
    } catch (error) {
      setItemsFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setOrderItems([]);
    } finally {
      setItemsLoading(false);
    }
  }

  async function loadCreateReferences() {
    setCustomersLoading(true);
    setCustomersLoaded(false);
    setCreateFeedback("");
    try {
      const customersResponse = await fetchBackend("/masters/customers?page=1&page_size=100");
      const customerItems = asArray(asObject(customersResponse).items).map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? row.outlet_name ?? "Customer"),
      }));
      setCustomers(customerItems);
      setSelectedCustomerId((prev) => prev || customerItems[0]?.id || "");
      setCustomersLoaded(true);
    } catch (error) {
      setCustomers([]);
      setSelectedCustomerId("");
      setCreateFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setCustomersLoaded(true);
    } finally {
      setCustomersLoading(false);
    }
  }

  async function fetchCreateSearchResults(searchText: string): Promise<CreateStockRow[]> {
    const term = searchText.trim();
    const productParams = new URLSearchParams();
    productParams.set("page", "1");
    productParams.set("page_size", "50");
    productParams.set("search", term);

    const stockParams = new URLSearchParams();
    stockParams.set("limit", "100");
    stockParams.set("include_total", "false");
    stockParams.set("search", term);

    const [productsResponse, stockResponse] = await Promise.all([
      fetchBackend(`/masters/products?${productParams.toString()}`),
      fetchBackend(`/procurement/stock-snapshot?${stockParams.toString()}`),
    ]);

    const products: ProductSearchRow[] = asArray(asObject(productsResponse).items).map((row) => ({
      id: String(row.id ?? ""),
      sku: String(row.sku ?? "-"),
      name: String(row.name ?? "-"),
      unit: String(row.unit ?? "-"),
      base_price: toNumber(row.base_price),
    }));

    const groupedStock = new Map<string, CreateStockRow>();
    for (const row of asArray(asObject(stockResponse).items)) {
      const productId = String(row.product_id ?? "");
      const warehouseId = String(row.warehouse_id ?? "");
      const key = `${productId}:${warehouseId || "none"}`;
      const existing = groupedStock.get(key);
      const nextAvailable = toNumber(row.available_quantity);
      if (existing) {
        existing.available_quantity += nextAvailable;
        continue;
      }
      groupedStock.set(key, {
        batch_id: key,
        product_id: productId,
        warehouse_id: warehouseId,
        sku: String(row.sku ?? "-"),
        product_name: String(row.product_name ?? "-"),
        warehouse_name: String(row.warehouse_name ?? "-"),
        unit: String(row.unit ?? "-"),
        batch_no: String(row.batch_no ?? "-"),
        base_price: toNumber(row.base_price),
        available_quantity: nextAvailable,
      });
    }

    const results: CreateStockRow[] = [];
    for (const product of products) {
      const matches = [...groupedStock.values()].filter((row) => row.product_id === product.id);
      if (matches.length === 0) {
        results.push({
          batch_id: `no-stock:${product.id}`,
          product_id: product.id,
          warehouse_id: "",
          sku: product.sku,
          product_name: product.name,
          warehouse_name: "No stock available",
          unit: product.unit,
          batch_no: "-",
          base_price: product.base_price,
          available_quantity: 0,
        });
        continue;
      }
      results.push(...matches);
    }
    return results.sort((a, b) => {
      if (a.product_name !== b.product_name) {
        return a.product_name.localeCompare(b.product_name);
      }
      if (a.available_quantity !== b.available_quantity) {
        return b.available_quantity - a.available_quantity;
      }
      return a.warehouse_name.localeCompare(b.warehouse_name);
    });
  }

  async function searchCreateStock(term: string) {
    setCreateLoading(true);
    setCreateFeedback("");
    try {
      setStockRows(await fetchCreateSearchResults(term));
    } catch (error) {
      setCreateFeedback(`Stock load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setStockRows([]);
    } finally {
      setCreateLoading(false);
    }
  }

  function resetCreateDialogState() {
    setCreateFeedback("");
    setCreateLoading(false);
    setCustomersLoading(false);
    setCustomersLoaded(false);
    setPlacingOrder(false);
    setCustomers([]);
    setSelectedCustomerId("");
    setStockRows([]);
    setStockSearchInput("");
    setDraftQtyByBatch({});
    setCartItems([]);
  }

  useEffect(() => {
    if (!openCreateDialog) {
      return;
    }
    const term = stockSearchInput.trim();
    if (!term) {
      setStockRows([]);
      setCreateLoading(false);
      return;
    }
    if (term.length < 3) {
      setStockRows([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void searchCreateStock(term);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [openCreateDialog, stockSearchInput]);

  function getDraftQty(row: CreateStockRow): number {
    const raw = draftQtyByBatch[row.batch_id];
    if (!Number.isFinite(raw)) {
      return 1;
    }
    const maxQty = Math.max(1, Math.floor(row.available_quantity));
    return Math.min(maxQty, Math.max(1, Math.floor(raw)));
  }

  function setDraftQty(batchId: string, next: number, max: number) {
    const maxQty = Math.max(1, Math.floor(max));
    const clamped = Math.min(maxQty, Math.max(1, Math.floor(next || 1)));
    setDraftQtyByBatch((prev) => ({ ...prev, [batchId]: clamped }));
  }

  function addToCart(row: CreateStockRow) {
    if (row.available_quantity <= 0) {
      return;
    }
    const requestedQty = getDraftQty(row);
    setCartItems((prev) => {
      const existing = prev.find((item) => item.batch_id === row.batch_id);
      if (!existing) {
        return [...prev, { ...row, quantity: requestedQty }];
      }
      return prev.map((item) =>
        item.batch_id === row.batch_id
          ? { ...item, quantity: Math.min(Math.floor(row.available_quantity), item.quantity + requestedQty) }
          : item
      );
    });
    toast.success(`${row.product_name || row.sku} added`, {
      description: `Quantity: ${requestedQty}`,
    });
  }

  function updateCartQty(batchId: string, next: number) {
    setCartItems((prev) =>
      prev.map((item) =>
        item.batch_id === batchId
          ? {
              ...item,
              quantity: Math.min(Math.max(1, Math.floor(next || 1)), Math.max(1, Math.floor(item.available_quantity))),
            }
          : item
      )
    );
  }

  function removeCartItem(batchId: string) {
    setCartItems((prev) => prev.filter((item) => item.batch_id !== batchId));
  }

  async function createAdminSalesOrder() {
    if (placingOrder) {
      return;
    }
    if (!selectedCustomerId) {
      toast.error("Select customer before creating sales order.");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Add at least one item.");
      return;
    }
    setPlacingOrder(true);
    setCreateFeedback("");
    try {
      const grouped = new Map<string, Map<string, number>>();
      for (const item of cartItems) {
        const byProduct = grouped.get(item.warehouse_id) ?? new Map<string, number>();
        byProduct.set(item.product_id, (byProduct.get(item.product_id) ?? 0) + item.quantity);
        grouped.set(item.warehouse_id, byProduct);
      }

      await Promise.all(
        [...grouped.entries()].map(([warehouseId, byProduct]) =>
          postBackend("/sales/sales-orders", {
            warehouse_id: warehouseId,
            customer_id: selectedCustomerId,
            source: "ADMIN",
            items: [...byProduct.entries()].map(([productId, quantity]) => ({
              product_id: productId,
              quantity,
            })),
          })
        )
      );

      store.dispatch(invalidateByPrefixes(["/sales/sales-orders", "/procurement/stock-snapshot"]));
      setRefreshKey(Date.now());
      setOpenCreateDialog(false);
      resetCreateDialogState();
      toast.success("Sales order created successfully.");
    } catch (error) {
      const message = `Order creation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setCreateFeedback(message);
      toast.error(message);
    } finally {
      setPlacingOrder(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Sales Orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search invoice, customer, warehouse"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (value.trim() === "" && search !== "") {
                resetPage();
                setSearch("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSearch();
              }
            }}
          />
          <Button onClick={onSearch} disabled={loading}>
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput("");
              resetPage();
              setSearch("");
            }}
            disabled={loading && search === ""}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              setOpenCreateDialog(true);
              void loadCreateReferences();
            }}
          >
            Create Sales Order
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">Selected rows: {selectedCount}</p>
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

          <div className="overflow-hidden rounded-lg border">
            <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead className="w-[20%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Invoice</TableHead>
                <TableHead className="w-[20%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Customer</TableHead>
                <TableHead className="w-[8%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Items</TableHead>
                <TableHead className="w-[12%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Source</TableHead>
                <TableHead className="w-[10%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Status</TableHead>
                <TableHead className="w-[20%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Created</TableHead>
                <TableHead className="w-[10%] uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 10 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-44 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No sales orders found.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                rows.map((row, index) => (
                  <TableRow key={row.id || `${row.invoice_number}-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => toggleSelectOne(row.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell className="truncate" title={row.invoice_number}>{row.invoice_number}</TableCell>
                    <TableCell className="truncate" title={row.customer_name}>{row.customer_name}</TableCell>
                    <TableCell className="text-center">{row.item_count}</TableCell>
                    <TableCell className="truncate" title={row.source}>{row.source}</TableCell>
                    <TableCell className="truncate" title={row.status}>{row.status}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.created_at)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => void openViewDialog(row)}>
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          </div>

          {totalCount > 50 ? (
            <PaginationFooter
              loading={loading}
              page={currentPage}
              totalPages={totalPages}
              totalItems={totalCount}
              pageSize={pageSize}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setCurrentPage(1);
              }}
              onFirst={() => setCurrentPage(1)}
              onPrevious={() => setCurrentPage((p) => p - 1)}
              onNext={() => setCurrentPage((p) => p + 1)}
              onLast={() => setCurrentPage(totalPages)}
            />
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={openCreateDialog}
        onOpenChange={(open) => {
          setOpenCreateDialog(open);
          if (!open) {
            resetCreateDialogState();
          }
        }}
      >
        <DialogContent className="max-h-[88vh] !w-[88vw] !max-w-5xl overflow-y-auto border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <DialogHeader>
            <DialogTitle>Create Sales Order</DialogTitle>
            <DialogDescription>Select customer, add stock items, and create a sales order using the same flow as customer ordering.</DialogDescription>
          </DialogHeader>
          {createFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{createFeedback}</p> : null}
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-1">
                <Label>Customer *</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  disabled={customersLoading}
                >
                  <option value="">
                    {customersLoading
                      ? "Loading customers..."
                      : customers.length
                        ? "Select customer"
                        : customersLoaded
                          ? "No customers found"
                          : "Loading customers..."}
                  </option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="outline" className="gap-2" disabled>
                <ShoppingCart className="h-4 w-4" />
                Cart {cartItems.length}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Product Search</Label>
              <Input
                placeholder="Type first 3 letters of SKU, name or brand"
                value={stockSearchInput}
                onChange={(e) => setStockSearchInput(e.target.value)}
              />
              {stockSearchInput.trim().length > 0 && stockSearchInput.trim().length < 3 ? (
                <p className="text-xs text-muted-foreground">Enter at least 3 letters.</p>
              ) : null}
              {createLoading && stockSearchInput.trim().length >= 3 ? (
                <p className="text-xs text-muted-foreground">Searching products...</p>
              ) : null}
              {stockRows.length > 0 ? (
                <div className="max-h-72 overflow-y-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                  {stockRows.map((row) => (
                    <div key={row.batch_id} className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2 last:border-b-0 dark:border-zinc-800">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{row.sku || "-"}</p>
                        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                          {row.product_name || "-"} | {row.warehouse_name} | {row.unit}
                        </p>
                        <p className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                          Price {formatPrice(row.base_price)} | Available quantity {row.available_quantity}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(1, Math.floor(row.available_quantity))}
                          className="h-9 w-20 text-right"
                          value={String(getDraftQty(row))}
                          onChange={(e) => setDraftQty(row.batch_id, Number(e.target.value), row.available_quantity)}
                          disabled={!row.warehouse_id || row.available_quantity <= 0}
                        />
                        <Button size="sm" variant="outline" onClick={() => addToCart(row)} disabled={!row.warehouse_id || row.available_quantity <= 0}>
                          Add
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {stockSearchInput.trim().length >= 3 && !createLoading && stockRows.length === 0 ? (
                <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No results found.</p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">Cart</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Quantity cannot exceed available stock.</p>
              </div>
              {cartItems.length === 0 ? (
                <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No items added yet.</p>
              ) : (
                <div className="space-y-2">
                  {cartItems.map((item) => (
                    <div
                      key={item.batch_id}
                      className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-12 md:items-end"
                    >
                      <div className="md:col-span-4">
                        <p className="text-xs text-muted-foreground">Product</p>
                        <p className="font-medium">{item.product_name || "-"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.sku || "-"}</p>
                      </div>
                      <div className="md:col-span-3">
                        <p className="text-xs text-muted-foreground">Warehouse / Unit</p>
                        <p className="font-medium">{item.warehouse_name || "-"}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.unit || "-"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-xs text-muted-foreground">Price / Available</p>
                        <p className="font-medium">{formatPrice(item.base_price)}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Available quantity {item.available_quantity}</p>
                      </div>
                      <div className="md:col-span-1">
                        <p className="mb-1 text-xs text-muted-foreground">Quantity</p>
                        <Input
                          type="number"
                          min={1}
                          max={Math.max(1, Math.floor(item.available_quantity))}
                          className="h-10 text-right"
                          value={String(item.quantity)}
                          onChange={(e) => updateCartQty(item.batch_id, Number(e.target.value))}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <p className="mb-1 text-xs text-muted-foreground">Action</p>
                        <Button size="sm" variant="outline" onClick={() => removeCartItem(item.batch_id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={() => void createAdminSalesOrder()} disabled={placingOrder || cartItems.length === 0 || !selectedCustomerId}>
                {placingOrder ? "Creating..." : "Create Sales Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(viewOrder)}
        onOpenChange={(open) => {
          if (!open) {
            setViewOrder(null);
            setOrderItems([]);
            setItemsFeedback("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] !w-[96vw] !max-w-5xl overflow-y-auto border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 [&>button]:hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Order Items</DialogTitle>
            <DialogDescription>Product, price and quantity for this sales order.</DialogDescription>
          </DialogHeader>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Order Items</h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">Product, price and quantity for this sales order.</p>
            </div>
            <button
              onClick={() => {
                setViewOrder(null);
                setOrderItems([]);
                setItemsFeedback("");
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
              aria-label="Close order details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {viewOrder ? (
            <DialogDescription className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Invoice {viewOrder.invoice_number} | Customer {viewOrder.customer_name} | Warehouse {viewOrder.warehouse_name}
            </DialogDescription>
          ) : null}
          {itemsFeedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{itemsFeedback}</p> : null}
          <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
            <Table className="w-full table-fixed text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">SKU</TableHead>
                  <TableHead className="w-[38%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Product</TableHead>
                  <TableHead className="w-[12%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Unit</TableHead>
                  <TableHead className="w-[16%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Price</TableHead>
                  <TableHead className="w-[14%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading
                  ? Array.from({ length: 6 }).map((_, index) => (
                      <TableRow key={`item-skeleton-${index}`} className={index % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}>
                        <TableCell className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800"><Skeleton className="h-5 w-32 dark:h-5" /></TableCell>
                        <TableCell className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800"><Skeleton className="h-5 w-44 dark:h-5" /></TableCell>
                        <TableCell className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800"><Skeleton className="h-5 w-12 dark:h-5" /></TableCell>
                        <TableCell className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800"><Skeleton className="ml-auto h-5 w-16 dark:h-5" /></TableCell>
                        <TableCell className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800"><Skeleton className="ml-auto h-5 w-12 dark:h-5" /></TableCell>
                      </TableRow>
                    ))
                  : null}
                {!itemsLoading && orderItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                      No items found for this sales order.
                    </TableCell>
                  </TableRow>
                ) : null}
                {!itemsLoading &&
                  orderItems.map((item, index) => (
                    <TableRow key={item.id || `${item.product_id}-${item.sku}`} className={index % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}>
                      <TableCell className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.sku}</TableCell>
                      <TableCell className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.product_name}</TableCell>
                      <TableCell className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.unit}</TableCell>
                      <TableCell className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{item.unit_price}</TableCell>
                      <TableCell className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{item.quantity}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
