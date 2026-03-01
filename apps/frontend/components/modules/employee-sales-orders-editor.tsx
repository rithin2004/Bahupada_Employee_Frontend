"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, postBackend } from "@/lib/backend-api";
import { invalidateByPrefixes } from "@/lib/state/api-cache-slice";
import { store } from "@/lib/state/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type QueueRow = {
  sales_order_id: string;
  customer_id: string;
  customer_name: string;
  warehouse_id: string;
  source: string;
  status: string;
  created_at: string;
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

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
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

export function EmployeeSalesOrdersEditor() {
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersLoaded, setCustomersLoaded] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [createFeedback, setCreateFeedback] = useState("");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [stockRows, setStockRows] = useState<CreateStockRow[]>([]);
  const [stockSearchInput, setStockSearchInput] = useState("");
  const [draftQtyByBatch, setDraftQtyByBatch] = useState<Record<string, number>>({});
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  async function loadQueue() {
    setQueueLoading(true);
    try {
      const response = asObject(await fetchBackend("/sales/dashboard/pending-orders?limit=40"));
      const items = asArray(response.items).map((row) => ({
        sales_order_id: String(row.sales_order_id ?? ""),
        customer_id: String(row.customer_id ?? ""),
        customer_name: String(row.customer_name ?? "-"),
        warehouse_id: String(row.warehouse_id ?? ""),
        source: String(row.source ?? "-"),
        status: String(row.status ?? "-"),
        created_at: String(row.created_at ?? ""),
      }));
      setQueueRows(items);
    } catch {
      setQueueRows([]);
    } finally {
      setQueueLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

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

  const fetchCreateSearchResults = useCallback(async (searchText: string): Promise<CreateStockRow[]> => {
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
  }, []);

  const searchCreateStock = useCallback(async (term: string) => {
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
  }, [fetchCreateSearchResults]);

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
  }, [openCreateDialog, searchCreateStock, stockSearchInput]);

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

  async function createSalesOrder() {
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
            source: "SALESMAN",
            items: [...byProduct.entries()].map(([productId, quantity]) => ({
              product_id: productId,
              quantity,
            })),
          })
        )
      );

      store.dispatch(invalidateByPrefixes(["/sales/sales-orders", "/sales/dashboard/pending-orders", "/procurement/stock-snapshot"]));
      toast.success("Sales order created successfully.");
      setOpenCreateDialog(false);
      resetCreateDialogState();
      await loadQueue();
    } catch (error) {
      const message = `Order creation failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setCreateFeedback(message);
      toast.error(message);
    } finally {
      setPlacingOrder(false);
    }
  }

  const uniqueCustomers = useMemo(
    () => new Set(queueRows.map((item) => item.customer_id).filter(Boolean)).size,
    [queueRows]
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Pending Orders</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{queueRows.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Visible Queue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{queueRows.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Unique Customers</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-semibold">{uniqueCustomers}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Order Queue</CardTitle>
            <Button
              onClick={() => {
                setOpenCreateDialog(true);
                void loadCreateReferences();
              }}
            >
              Create Sales Order
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                  <TableHead className="w-[30%]">Customer</TableHead>
                  <TableHead className="w-[18%]">Source</TableHead>
                  <TableHead className="w-[18%]">Status</TableHead>
                  <TableHead className="w-[34%]">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queueLoading
                  ? Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={`queue-skeleton-${index}`}>
                        <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                      </TableRow>
                    ))
                  : null}
                {!queueLoading && queueRows.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={4}>
                      No pending orders found.
                    </TableCell>
                  </TableRow>
                ) : null}
                {!queueLoading &&
                  queueRows.map((item) => (
                    <TableRow key={item.sales_order_id}>
                      <TableCell>{item.customer_name}</TableCell>
                      <TableCell>{item.source}</TableCell>
                      <TableCell>{item.status}</TableCell>
                      <TableCell>{formatDate(item.created_at)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
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
            <DialogDescription>Salesman can create orders using the same stock-based flow as admin.</DialogDescription>
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
                    <div key={item.batch_id} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-12 md:items-end">
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
              <Button onClick={() => void createSalesOrder()} disabled={placingOrder || cartItems.length === 0 || !selectedCustomerId}>
                {placingOrder ? "Creating..." : "Create Sales Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
