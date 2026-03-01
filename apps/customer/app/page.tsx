"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, ClipboardList, CreditCard, Eye, LogOut, Menu, Moon, ShoppingCart, Sun, Tag, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  setActive,
  setCartOpen,
  setFeedback,
  setSidebarOpen,
} from "@/lib/state/customer-ui-slice";
import {
  setCurrentCursor,
  setCursorHistory,
  setHasMore,
  setLastLoadedKey,
  setNextCursor,
  resetCursorState,
  setRows,
  setSearch,
  setSearchInput,
  setTotalItems,
} from "@/lib/state/customer-inventory-slice";
import {
  addToCart as addToCartAction,
  clearCart,
  removeFromCart,
  setDraftQty as setDraftQtyAction,
  updateCartQuantity,
} from "@/lib/state/customer-cart-slice";
import type { StockRow } from "@/lib/state/customer-types";
import { useAppDispatch, useAppSelector } from "@/lib/state/hooks";
import { clearCustomerSession, fetchWithCustomerAuth } from "@/lib/auth-session";

const PAGE_SIZE = 50;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value.filter((v) => v && typeof v === "object") as Record<string, unknown>[]) : [];
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) {
    return "0.00";
  }
  return value.toFixed(2);
}

type CustomerOption = { id: string; name: string };
type OrderRow = {
  sales_order_id: string;
  order_date: string;
  source: string;
  status: string;
  total: number;
};
type OrderItemRow = {
  sales_order_item_id: string;
  sku: string;
  product_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
};

async function getJson(path: string) {
  const response = await fetchWithCustomerAuth(path, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

async function postJson(path: string, body: Record<string, unknown>) {
  const response = await fetchWithCustomerAuth(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = asObject(await response.json());
      detail = typeof payload.detail === "string" ? payload.detail : "";
    } catch {
      detail = "";
    }
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default function CustomerDashboardPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const dispatch = useAppDispatch();
  const uiState = useAppSelector((state) => state.customerUi);
  const inventoryState = useAppSelector((state) => state.customerInventory);
  const cartState = useAppSelector((state) => state.customerCart);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersInitialized, setOrdersInitialized] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [orderItemsLoading, setOrderItemsLoading] = useState(false);
  const [orderItemsError, setOrderItemsError] = useState("");
  const [viewOrderId, setViewOrderId] = useState<string | null>(null);
  const [viewOrderItems, setViewOrderItems] = useState<OrderItemRow[]>([]);
  const { active, sidebarOpen, cartOpen, feedback } = uiState;
  const { searchInput, search, rows, currentCursor, nextCursor, cursorHistory, hasMore, totalItems, lastLoadedKey } = inventoryState;
  const { cartItems, draftQtyByBatch } = cartState;
  const renderedActive = mounted ? active : "inventory";

  const navItems = useMemo(
    () => [
      { key: "inventory" as const, label: "Inventory", icon: Boxes },
      { key: "my-orders" as const, label: "My Orders", icon: ClipboardList },
      { key: "schemes" as const, label: "Schemes", icon: Tag },
      { key: "credit-debit" as const, label: "Credit Debit", icon: CreditCard },
    ],
    []
  );

  const totalPages = totalItems > 0 ? Math.ceil(totalItems / PAGE_SIZE) : 0;
  const page = cursorHistory.length + 1;
  const renderLoading = !mounted || loading;
  const renderRows = mounted ? rows : [];

  const fetchInventory = useCallback(async (cursor: string | null, searchText: string, includeTotal = true) => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("include_total", includeTotal ? "true" : "false");
    if (cursor) {
      params.set("cursor", cursor);
    }
    if (searchText.trim()) {
      params.set("search", searchText.trim());
    }
    const response = asObject(await getJson(`/procurement/stock-snapshot?${params.toString()}`));
    const items = asArray(response.items).map((row) => ({
      batch_id: String(row.batch_id ?? ""),
      product_id: String(row.product_id ?? ""),
      warehouse_id: String(row.warehouse_id ?? ""),
      sku: String(row.sku ?? ""),
      product_name: String(row.product_name ?? ""),
      warehouse_name: String(row.warehouse_name ?? ""),
      unit: String(row.unit ?? ""),
      base_price: toNumber(row.base_price),
      available_quantity: toNumber(row.available_quantity),
      batch_no: String(row.batch_no ?? ""),
    }));
    return {
      items,
      total: toNumber(response.total),
      hasMore: Boolean(response.has_more),
      nextCursor: typeof response.next_cursor === "string" && response.next_cursor.length > 0 ? response.next_cursor : null,
    };
  }, []);

  const loadInventory = useCallback(async (cursor: string | null, searchText: string, requestKey: string) => {
    setLoading(true);
    dispatch(setFeedback(""));
    try {
      const response = await fetchInventory(cursor, searchText, true);
      dispatch(setRows(response.items));
      dispatch(setTotalItems(response.total));
      dispatch(setHasMore(response.hasMore));
      dispatch(setNextCursor(response.nextCursor));
      dispatch(setLastLoadedKey(requestKey));
    } catch (error) {
      dispatch(setRows([]));
      dispatch(setTotalItems(0));
      dispatch(setHasMore(false));
      dispatch(setNextCursor(null));
      dispatch(setFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`));
      dispatch(setLastLoadedKey(requestKey));
    } finally {
      setLoading(false);
    }
  }, [dispatch, fetchInventory]);

  useEffect(() => {
    setMounted(true);
    // Force a fresh inventory fetch after full page reload while still
    // keeping persisted UI/cart state.
    dispatch(setLastLoadedKey(null));
  }, [dispatch]);

  useEffect(() => {
    async function loadCurrentCustomer() {
      setCustomersLoading(true);
      try {
        const response = asObject(await getJson("/auth/me"));
        const customerId = String(response.customer_id ?? "");
        const customerName = String(response.display_name ?? "Customer");
        if (!customerId || !isUuid(customerId)) {
          setCustomers([]);
          setSelectedCustomerId("");
          return;
        }
        setCustomers([{ id: customerId, name: customerName }]);
        setSelectedCustomerId(customerId);
      } catch {
        setCustomers([]);
        setSelectedCustomerId("");
      } finally {
        setCustomersLoading(false);
      }
    }
    void loadCurrentCustomer();
  }, []);

  useEffect(() => {
    if (active !== "inventory") {
      return;
    }
    const requestKey = `${currentCursor ?? "first"}::${search.trim()}`;
    if (lastLoadedKey === requestKey) {
      setLoading(false);
      return;
    }
    void loadInventory(currentCursor, search, requestKey);
  }, [active, currentCursor, lastLoadedKey, loadInventory, search]);

  useEffect(() => {
    if (active !== "my-orders") {
      return;
    }
    if (customersLoading) {
      setOrdersLoading(true);
      setOrdersError("");
      return;
    }
    if (!selectedCustomerId || !isUuid(selectedCustomerId)) {
      setOrders([]);
      setOrdersLoading(false);
      setOrdersInitialized(true);
      setOrdersError(customers.length === 0 ? "No customers available." : "Select a customer to view orders.");
      return;
    }
    async function loadOrders() {
      setOrdersLoading(true);
      setOrdersError("");
      try {
        const response = asArray(await getJson(`/customer/customers/${selectedCustomerId}/orders`));
        const items = response.map((row) => ({
          sales_order_id: String(row.sales_order_id ?? ""),
          order_date: String(row.order_date ?? ""),
          source: String(row.source ?? ""),
          status: String(row.status ?? ""),
          total: toNumber(row.total),
        }));
        setOrders(items);
      } catch (error) {
        setOrders([]);
        setOrdersError(`Failed to load orders: ${error instanceof Error ? error.message : "Unknown error"}`);
      } finally {
        setOrdersInitialized(true);
        setOrdersLoading(false);
      }
    }
    void loadOrders();
  }, [active, customers.length, customersLoading, selectedCustomerId]);

  const disablePrev = loading || page <= 1;
  const disableNext = loading || !hasMore || !nextCursor;

  async function goLast() {
    if (loading || !hasMore || !nextCursor) {
      return;
    }
    setLoading(true);
    dispatch(setFeedback(""));
    try {
      let probeCursor: string | null = currentCursor;
      let probeNext: string | null = nextCursor;
      let probeHasMore = hasMore;
      let probeHistory = [...cursorHistory];
      let safety = 0;

      while (probeHasMore && probeNext && safety < 500) {
        probeHistory = [...probeHistory, probeCursor];
        probeCursor = probeNext;
        const response = await fetchInventory(probeCursor, search, false);
        probeHasMore = response.hasMore;
        probeNext = response.nextCursor;
        safety += 1;
      }

      dispatch(setCursorHistory(probeHistory));
      dispatch(setCurrentCursor(probeCursor));
      dispatch(setNextCursor(probeNext));
      dispatch(setHasMore(probeHasMore));
    } catch (error) {
      dispatch(setFeedback(`Failed to jump to last page: ${error instanceof Error ? error.message : "Unknown error"}`));
      setLoading(false);
    }
  }

  async function openOrderDetails(orderId: string) {
    if (!selectedCustomerId || !isUuid(selectedCustomerId)) {
      toast.error("Select a valid customer first.");
      return;
    }
    setViewOrderId(orderId);
    setViewOrderItems([]);
    setOrderItemsError("");
    setOrderItemsLoading(true);
    try {
      const response = asArray(await getJson(`/customer/customers/${selectedCustomerId}/orders/${orderId}/items`));
      const items = response.map((row) => ({
        sales_order_item_id: String(row.sales_order_item_id ?? ""),
        sku: String(row.sku ?? ""),
        product_name: String(row.product_name ?? ""),
        unit: String(row.unit ?? ""),
        quantity: toNumber(row.quantity),
        unit_price: toNumber(row.unit_price),
      }));
      setViewOrderItems(items);
    } catch (error) {
      setOrderItemsError(`Failed to load order items: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setOrderItemsLoading(false);
    }
  }

  function getDraftQty(row: StockRow): number {
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
    dispatch(setDraftQtyAction({ batchId, qty: clamped }));
  }

  async function logout() {
    try {
      await fetchWithCustomerAuth("/auth/logout", { method: "POST" });
    } catch {
      // Best-effort revoke.
    }
    clearCustomerSession();
    router.replace("/login");
  }

  function addToCart(row: StockRow) {
    if (row.available_quantity <= 0) {
      return;
    }
    const requestedQty = getDraftQty(row);
    dispatch(addToCartAction({ row, requestedQty }));
    toast.success(`${row.product_name || row.sku || "Item"} added to cart`, {
      description: `Quantity: ${requestedQty}`,
    });
  }

  async function createSalesChallan() {
    if (placingOrder) {
      return;
    }
    if (!selectedCustomerId) {
      toast.error("Select customer before creating sales challan.");
      return;
    }
    if (cartItems.length === 0) {
      toast.error("Cart is empty.");
      return;
    }
    if (!cartItems.every((item) => isUuid(item.product_id) && isUuid(item.warehouse_id))) {
      toast.error("Cart contains stale items. Please remove and add items again.");
      return;
    }

    setPlacingOrder(true);
    try {
      const grouped = new Map<string, Map<string, number>>();
      for (const item of cartItems) {
        const byProduct = grouped.get(item.warehouse_id) ?? new Map<string, number>();
        byProduct.set(item.product_id, (byProduct.get(item.product_id) ?? 0) + item.quantity);
        grouped.set(item.warehouse_id, byProduct);
      }

      await Promise.all(
        [...grouped.entries()].map(([warehouseId, byProduct]) =>
          postJson("/sales/sales-orders", {
            warehouse_id: warehouseId,
            customer_id: selectedCustomerId,
            source: "CUSTOMER",
            items: [...byProduct.entries()].map(([productId, quantity]) => ({
              product_id: productId,
              quantity,
            })),
          })
        )
      );

      dispatch(clearCart());
      dispatch(setCartOpen(false));
      toast.success("Order created successfully.");
    } catch (error) {
      toast.error(`Order creation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setPlacingOrder(false);
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:flex md:flex-col">
          <div className="border-b border-zinc-200 px-6 py-5 dark:border-zinc-800">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Bahu ERP</p>
            <h1 className="mt-2 text-2xl font-semibold">Customer Panel</h1>
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = renderedActive === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => dispatch(setActive(item.key))}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <div
          className={`fixed inset-0 z-50 bg-black/40 transition-opacity md:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
          onClick={() => dispatch(setSidebarOpen(false))}
        />
        <aside
          className={`fixed left-0 top-0 z-50 h-full w-72 border-r border-zinc-200 bg-white p-4 transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-900 md:hidden ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Bahu ERP</p>
              <h2 className="text-xl font-semibold">Customer Panel</h2>
            </div>
            <button
              onClick={() => dispatch(setSidebarOpen(false))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = renderedActive === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    dispatch(setActive(item.key));
                    dispatch(setSidebarOpen(false));
                  }}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90 md:px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => dispatch(setSidebarOpen(true))}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Operations Workspace</p>
                  <h2 className="text-lg font-semibold">Customer Dashboard</h2>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="relative inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                  onClick={() => dispatch(setCartOpen(true))}
                >
                  <ShoppingCart className="h-4 w-4" />
                  Cart
                  {mounted && cartItems.length > 0 ? (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {cartItems.length}
                    </span>
                  ) : null}
                </button>
                {mounted ? (
                  <button
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                    onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  >
                    {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {resolvedTheme === "dark" ? "Light" : "Dark"}
                  </button>
                ) : null}
                <button
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm dark:border-zinc-700"
                  onClick={() => void logout()}
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </header>

          <section className="space-y-4 p-4 md:p-6">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-200 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-4 py-4 dark:border-zinc-800 md:px-6">
                <h3 className="text-xl font-semibold">
                  {renderedActive === "inventory"
                    ? "Inventory"
                    : renderedActive === "my-orders"
                      ? "My Orders"
                      : renderedActive === "schemes"
                        ? "Schemes"
                        : "Credit Debit"}
                </h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {renderedActive === "inventory"
                    ? "Live products from stock snapshot."
                    : renderedActive === "my-orders"
                      ? "View your created sales orders."
                      : renderedActive === "schemes"
                        ? "Schemes module will be added here."
                        : "Credit Debit module will be added here."}
                </p>
              </div>

              <div className="p-4 md:p-6">
                <div className={`transition-all duration-200 ${renderedActive === "inventory" ? "opacity-100" : "opacity-0"}`}>
                  {renderedActive === "inventory" ? (
                    <div className="space-y-3">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <InputLike
                          placeholder="Search SKU, product, batch, warehouse"
                          value={searchInput}
                          onChange={(value) => {
                            dispatch(setSearchInput(value));
                            if (value.trim() === "" && search !== "") {
                              dispatch(setSearch(""));
                              dispatch(resetCursorState());
                            }
                          }}
                          onEnter={() => {
                            dispatch(setSearch(searchInput.trim()));
                            dispatch(resetCursorState());
                          }}
                        />
                        <button
                          className="h-10 rounded-md bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-zinc-300"
                          onClick={() => {
                            dispatch(setSearch(searchInput.trim()));
                            dispatch(resetCursorState());
                          }}
                          disabled={loading}
                        >
                          Search
                        </button>
                        <button
                          className="h-10 rounded-md border border-zinc-300 px-5 text-sm dark:border-zinc-700"
                          onClick={() => {
                            dispatch(setSearchInput(""));
                            dispatch(setSearch(""));
                            dispatch(resetCursorState());
                          }}
                        >
                          Reset
                        </button>
                      </div>

                      {feedback ? <p className="rounded-md border px-3 py-2 text-sm text-red-600 dark:text-red-300">{feedback}</p> : null}

                      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                        <table className="w-full table-fixed text-sm">
                          <thead>
                            <tr>
                              <th className="w-[16%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">SKU</th>
                              <th className="w-[36%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Product</th>
                              <th className="w-[10%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Price</th>
                              <th className="w-[11%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Available</th>
                              <th className="w-[12%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Qty</th>
                              <th className="w-[15%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {renderLoading
                              ? Array.from({ length: 10 }).map((_, i) => (
                                  <tr key={`sk-${i}`} className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}>
                                    {Array.from({ length: 6 }).map((__, j) => (
                                      <td key={`sk-${i}-${j}`} className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                                        <div className="h-5 w-full max-w-[180px] animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
                                      </td>
                                    ))}
                                  </tr>
                                ))
                              : null}

                            {!renderLoading && renderRows.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                                  No products found.
                                </td>
                              </tr>
                            ) : null}

                            {!renderLoading
                              ? renderRows.map((row, i) => (
                                  <tr
                                    key={row.batch_id || `${row.product_id}-${i}`}
                                    className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}
                                  >
                                    <td className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{row.sku || "-"}</td>
                                    <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                                      <p className="break-words font-medium">{row.product_name || "-"}</p>
                                      <p className="mt-0.5 break-words text-xs text-zinc-600 dark:text-zinc-400">
                                        {row.warehouse_name || "-"} | {row.batch_no || "-"} | {row.unit || "-"}
                                      </p>
                                    </td>
                                    <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{formatPrice(row.base_price)}</td>
                                    <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{row.available_quantity}</td>
                                    <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">
                                      <input
                                        type="number"
                                        min={1}
                                        max={Math.max(1, Math.floor(row.available_quantity))}
                                        value={getDraftQty(row)}
                                        onChange={(e) => setDraftQty(row.batch_id, Number(e.target.value), row.available_quantity)}
                                        disabled={row.available_quantity <= 0}
                                        className="h-8 w-16 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                                      />
                                    </td>
                                    <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                                      <button
                                        className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                        onClick={() => addToCart(row)}
                                        disabled={row.available_quantity <= 0}
                                      >
                                        Add to Cart
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              : null}
                          </tbody>
                        </table>
                      </div>

                      {totalItems > PAGE_SIZE ? (
                        <div className="flex flex-col gap-2 rounded-lg border bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 md:flex-row md:items-center md:justify-between">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 md:text-sm">
                            Page {totalPages > 0 ? page : 0} of {totalPages} | Total {totalItems} products
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              className="h-8 rounded-md border border-zinc-300 px-3 text-xs disabled:opacity-50 dark:border-zinc-700"
                              onClick={() => {
                                if (disablePrev) {
                                  return;
                                }
                                dispatch(resetCursorState());
                              }}
                              disabled={disablePrev}
                            >
                              First
                            </button>
                            <button
                              className="h-8 rounded-md border border-zinc-300 px-3 text-xs disabled:opacity-50 dark:border-zinc-700"
                              onClick={() => {
                                if (disablePrev) {
                                  return;
                                }
                                const previousCursor = cursorHistory[cursorHistory.length - 1] ?? null;
                                dispatch(setCursorHistory(cursorHistory.slice(0, -1)));
                                dispatch(setCurrentCursor(previousCursor));
                                dispatch(setNextCursor(null));
                              }}
                              disabled={disablePrev}
                            >
                              Previous
                            </button>
                            <button
                              className="h-8 rounded-md bg-zinc-900 px-3 text-xs text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
                              onClick={() => {
                                if (disableNext || !nextCursor) {
                                  return;
                                }
                                dispatch(setCursorHistory([...cursorHistory, currentCursor]));
                                dispatch(setCurrentCursor(nextCursor));
                              }}
                              disabled={disableNext}
                            >
                              Next
                            </button>
                            <button
                              className="h-8 rounded-md border border-zinc-300 px-3 text-xs disabled:opacity-50 dark:border-zinc-700"
                              onClick={() => {
                                void goLast();
                              }}
                              disabled={disableNext}
                            >
                              Last
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {renderedActive === "schemes" ? (
                  <PlaceholderCard title="Schemes" description="Schemes dashboard will be implemented in this module." />
                ) : null}

                {renderedActive === "my-orders" ? (
                  <div className="space-y-3">
                    {ordersError ? <p className="rounded-md border px-3 py-2 text-sm text-red-600 dark:text-red-300">{ordersError}</p> : null}
                    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
                      <table className="w-full table-fixed text-sm">
                        <thead>
                          <tr>
                            <th className="w-[26%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Order ID</th>
                            <th className="w-[14%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Date</th>
                            <th className="w-[12%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Source</th>
                            <th className="w-[12%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Status</th>
                            <th className="w-[16%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Total</th>
                            <th className="w-[20%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ordersLoading || !ordersInitialized
                            ? Array.from({ length: 8 }).map((_, i) => (
                                <tr key={`order-sk-${i}`} className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}>
                                  {Array.from({ length: 6 }).map((__, j) => (
                                    <td key={`order-sk-${i}-${j}`} className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                                      <div className="h-5 w-full max-w-[180px] animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
                                    </td>
                                  ))}
                                </tr>
                              ))
                            : null}
                          {!ordersLoading && ordersInitialized && orders.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                                No orders found.
                              </td>
                            </tr>
                          ) : null}
                          {!ordersLoading && ordersInitialized
                            ? orders.map((order, i) => (
                                <tr
                                  key={order.sales_order_id || `order-${i}`}
                                  className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}
                                >
                                  <td className="break-all border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{order.sales_order_id}</td>
                                  <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{order.order_date || "-"}</td>
                                  <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{order.source || "-"}</td>
                                  <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{order.status || "-"}</td>
                                  <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{formatPrice(order.total)}</td>
                                  <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                                    <button
                                      className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-3 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                                      onClick={() => {
                                        void openOrderDetails(order.sales_order_id);
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      View
                                    </button>
                                  </td>
                                </tr>
                              ))
                            : null}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {renderedActive === "credit-debit" ? (
                  <PlaceholderCard title="Credit Debit" description="Credit and debit details will be implemented in this module." />
                ) : null}
              </div>
            </div>
          </section>

          <div
            className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${viewOrderId ? "opacity-100" : "pointer-events-none opacity-0"}`}
            onClick={() => setViewOrderId(null)}
          />
          <div
            className={`fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl transition-all dark:border-zinc-800 dark:bg-zinc-950 ${
              viewOrderId ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Order Items</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Product, price and quantity for this sales order.</p>
              </div>
              <button
                onClick={() => setViewOrderId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
                aria-label="Close order details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {orderItemsError ? <p className="mb-3 rounded-md border px-3 py-2 text-sm text-red-600 dark:text-red-300">{orderItemsError}</p> : null}
            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr>
                    <th className="w-[18%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">SKU</th>
                    <th className="w-[38%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Product</th>
                    <th className="w-[12%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Unit</th>
                    <th className="w-[16%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Price</th>
                    <th className="w-[16%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItemsLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`item-sk-${i}`} className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}>
                          {Array.from({ length: 5 }).map((__, j) => (
                            <td key={`item-sk-${i}-${j}`} className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                              <div className="h-5 w-full max-w-[180px] animate-pulse rounded bg-zinc-300 dark:bg-zinc-700" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : null}
                  {!orderItemsLoading && viewOrderItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                        No order items found.
                      </td>
                    </tr>
                  ) : null}
                  {!orderItemsLoading
                    ? viewOrderItems.map((item, i) => (
                        <tr key={item.sales_order_item_id || `item-${i}`} className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}>
                          <td className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.sku || "-"}</td>
                          <td className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.product_name || "-"}</td>
                          <td className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.unit || "-"}</td>
                          <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{formatPrice(item.unit_price)}</td>
                          <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{item.quantity}</td>
                        </tr>
                      ))
                    : null}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className={`fixed inset-0 z-50 bg-black/40 transition-opacity ${cartOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
            onClick={() => dispatch(setCartOpen(false))}
          />
          <aside
            className={`fixed right-0 top-0 z-50 h-full w-full max-w-2xl border-l border-zinc-200 bg-white p-4 transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950 ${
              cartOpen ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Cart Items</h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Quantity cannot exceed available stock.</p>
              </div>
              <button
                onClick={() => dispatch(setCartOpen(false))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 dark:border-zinc-700"
                aria-label="Close cart"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer</label>
              <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900">
                {customers[0]?.name || "Customer"}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr>
                    <th className="w-[16%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">SKU</th>
                    <th className="w-[35%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Product</th>
                    <th className="w-[10%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Price</th>
                    <th className="w-[11%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Available</th>
                    <th className="w-[12%] bg-zinc-200/80 px-3 py-3 text-right font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Qty</th>
                    <th className="w-[16%] bg-zinc-200/80 px-3 py-3 text-left font-semibold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-200">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cartItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-zinc-500 dark:text-zinc-400">
                        No items in cart.
                      </td>
                    </tr>
                  ) : (
                    cartItems.map((item, i) => (
                      <tr
                        key={`cart-${item.batch_id}-${i}`}
                        className={i % 2 === 0 ? "bg-zinc-50/80 dark:bg-zinc-900/30" : "bg-white dark:bg-zinc-950"}
                      >
                        <td className="break-words border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">{item.sku || "-"}</td>
                        <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                          <p className="break-words font-medium">{item.product_name || "-"}</p>
                          <p className="mt-0.5 break-words text-xs text-zinc-600 dark:text-zinc-400">
                            {item.warehouse_name || "-"} | {item.batch_no || "-"} | {item.unit || "-"}
                          </p>
                        </td>
                        <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{formatPrice(item.base_price)}</td>
                        <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">{item.available_quantity}</td>
                        <td className="border-b border-zinc-200 px-3 py-3 text-right dark:border-zinc-800">
                          <input
                            type="number"
                            min={1}
                            max={Math.max(1, Math.floor(item.available_quantity))}
                            value={item.quantity}
                            onChange={(e) => dispatch(updateCartQuantity({ batchId: item.batch_id, quantity: Number(e.target.value) }))}
                            className="h-8 w-16 rounded-md border border-zinc-300 bg-white px-2 text-right text-sm dark:border-zinc-700 dark:bg-zinc-900"
                          />
                        </td>
                        <td className="border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
                          <button
                            className="h-8 rounded-md border border-red-300 px-3 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
                            onClick={() => dispatch(removeFromCart(item.batch_id))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                className="h-9 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-200 dark:text-zinc-900"
                disabled={cartItems.length === 0 || placingOrder}
                onClick={() => {
                  void createSalesChallan();
                }}
              >
                {placingOrder ? "Creating..." : "Create Sales Challan"}
              </button>
            </div>
          </aside>
        </main>
      </div>
    </div>
  );
}

function InputLike({
  placeholder,
  value,
  onChange,
  onEnter,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <input
      className="h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none ring-0 placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          onEnter();
        }
      }}
    />
  );
}

function PlaceholderCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h4 className="text-lg font-semibold">{title}</h4>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
    </div>
  );
}
