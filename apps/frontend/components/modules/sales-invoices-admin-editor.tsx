"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, patchBackend, postBackend } from "@/lib/backend-api";
import { invalidateByPrefixes } from "@/lib/state/api-cache-slice";
import { usePersistedPage, usePersistedUiState } from "@/lib/state/pagination-hooks";
import { store } from "@/lib/state/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

type DeliveryVehicleOption = {
  assignment_id: string;
  vehicle_id: string;
  vehicle_name: string;
  registration_no: string;
  capacity_kg: number | null;
  driver_name: string | null;
  in_vehicle_employee_name: string | null;
  bill_manager_name: string | null;
  loader_name: string | null;
};

type DeliveryRunStop = {
  stop_id: string;
  sales_final_invoice_id: string;
  invoice_number: string;
  customer_name: string;
  total_amount: number;
  total_weight_grams: number;
  status: string;
  sequence_no: number | null;
  loading_sequence_no: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  e_invoice_number: string | null;
  gst_invoice_number: string | null;
  eway_bill_number: string | null;
  total_boxes_or_bags: number | null;
  loose_cases: number | null;
  full_cases: number | null;
};

type DeliveryRun = {
  run_id: string;
  warehouse_name: string;
  delivery_date: string;
  vehicle_name: string | null;
  registration_no: string | null;
  capacity_kg: number | null;
  driver_name: string | null;
  in_vehicle_employee_name: string | null;
  bill_manager_name: string | null;
  loader_name: string | null;
  status: string;
  total_weight_grams: number;
  optimized: boolean;
  route_provider: string | null;
  created_at: string;
  stops: DeliveryRunStop[];
};

type WorkflowInvoice = {
  batch_invoice_id: string;
  invoice_number: string;
  customer_name: string;
  assigned_packer_name: string;
  assigned_supervisor_name: string;
  status: string;
  total_weight_grams: number;
  ready_for_dispatch_at: string | null;
};

type WorkflowBatchSummary = {
  batch_id: string;
  batch_code: string;
  warehouse_name: string;
  status: string;
  invoice_count: number;
  created_at: string;
  invoices: WorkflowInvoice[];
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
  deliveryFilter: "ALL",
  allocationDate: new Date().toISOString().slice(0, 10),
  selectedVehicleId: "",
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
  const [deliveryFilter, setDeliveryFilter] = useState(String(persistedUiState.deliveryFilter || "ALL"));
  const [invoiceTotalCount, setInvoiceTotalCount] = useState(0);
  const [invoiceTotalPages, setInvoiceTotalPages] = useState(0);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [assigningInvoices, setAssigningInvoices] = useState(false);
  const [workflowBatches, setWorkflowBatches] = useState<WorkflowBatchSummary[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [allocationDialogOpen, setAllocationDialogOpen] = useState(false);
  const [allocationDate, setAllocationDate] = useState(persistedUiState.allocationDate || new Date().toISOString().slice(0, 10));
  const [vehicleOptions, setVehicleOptions] = useState<DeliveryVehicleOption[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(String(persistedUiState.selectedVehicleId || ""));
  const [vehicleOptionsLoading, setVehicleOptionsLoading] = useState(false);
  const [allocatingRun, setAllocatingRun] = useState(false);
  const [deliveryRuns, setDeliveryRuns] = useState<DeliveryRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [documentDrafts, setDocumentDrafts] = useState<Record<string, { e_invoice_number: string; gst_invoice_number: string; eway_bill_number: string }>>({});
  const [savingDocumentId, setSavingDocumentId] = useState<string | null>(null);
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
      deliveryFilter,
      allocationDate,
      selectedVehicleId,
    });
  }, [
    allocationDate,
    customerSearchInput,
    deliveryFilter,
    invoiceDate,
    invoiceSearch,
    invoiceSearchInput,
    selectedCustomer,
    selectedOrderId,
    selectedVehicleId,
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

  const loadInvoices = useCallback(async (page: number, searchText: string, size = pageSize) => {
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
  }, [pageSize]);

  const loadWorkflowBatches = useCallback(async () => {
    setWorkflowLoading(true);
    try {
      const response = asObject(await fetchBackend("/delivery-workflow/invoice-batches"));
      const items = asArray(response.items).map((batch) => ({
        batch_id: String(batch.batch_id ?? ""),
        batch_code: String(batch.batch_code ?? "-"),
        warehouse_name: String(batch.warehouse_name ?? "-"),
        status: String(batch.status ?? "-"),
        invoice_count: toNumber(batch.invoice_count),
        created_at: String(batch.created_at ?? ""),
        invoices: asArray(batch.invoices).map((invoice) => ({
          batch_invoice_id: String(invoice.batch_invoice_id ?? ""),
          invoice_number: String(invoice.invoice_number ?? "-"),
          customer_name: String(invoice.customer_name ?? "-"),
          assigned_packer_name: String(invoice.assigned_packer_name ?? "-"),
          assigned_supervisor_name: String(invoice.assigned_supervisor_name ?? "-"),
          status: String(invoice.status ?? "-"),
          total_weight_grams: toNumber(invoice.total_weight_grams),
          ready_for_dispatch_at: typeof invoice.ready_for_dispatch_at === "string" ? invoice.ready_for_dispatch_at : null,
        })),
      }));
      setWorkflowBatches(items);
      setSelectedBatchId((prev) => (items.some((batch) => batch.batch_id === prev) ? prev : items[0]?.batch_id || ""));
    } catch {
      setWorkflowBatches([]);
      setSelectedBatchId("");
    } finally {
      setWorkflowLoading(false);
    }
  }, []);

  const loadVehicleOptions = useCallback(async (dutyDate: string) => {
    if (!dutyDate) {
      setVehicleOptions([]);
      return;
    }
    setVehicleOptionsLoading(true);
    try {
      const response = asObject(await fetchBackend(`/planning/delivery/assignments/by-day?duty_date=${dutyDate}`));
      const items = asArray(response.items).map((row) => ({
        assignment_id: String(row.id ?? ""),
        vehicle_id: String(row.vehicle_id ?? ""),
        vehicle_name: String(row.vehicle_name ?? row.registration_no ?? "Vehicle"),
        registration_no: String(row.registration_no ?? "-"),
        capacity_kg: row.capacity_kg == null ? null : toNumber(row.capacity_kg),
        driver_name: row.driver_name == null ? null : String(row.driver_name),
        in_vehicle_employee_name: row.in_vehicle_employee_name == null ? null : String(row.in_vehicle_employee_name),
        bill_manager_name: row.bill_manager_name == null ? null : String(row.bill_manager_name),
        loader_name: row.loader_name == null ? null : String(row.loader_name),
      }));
      setVehicleOptions(items);
      setSelectedVehicleId((prev) => (items.some((item) => item.vehicle_id === prev) ? prev : items[0]?.vehicle_id || ""));
    } catch {
      setVehicleOptions([]);
      setSelectedVehicleId("");
    } finally {
      setVehicleOptionsLoading(false);
    }
  }, []);

  const mapDeliveryRun = useCallback((row: Record<string, unknown>): DeliveryRun => {
    return {
      run_id: String(row.run_id ?? ""),
      warehouse_name: String(row.warehouse_name ?? "-"),
      delivery_date: String(row.delivery_date ?? ""),
      vehicle_name: row.vehicle_name == null ? null : String(row.vehicle_name),
      registration_no: row.registration_no == null ? null : String(row.registration_no),
      capacity_kg: row.capacity_kg == null ? null : toNumber(row.capacity_kg),
      driver_name: row.driver_name == null ? null : String(row.driver_name),
      in_vehicle_employee_name: row.in_vehicle_employee_name == null ? null : String(row.in_vehicle_employee_name),
      bill_manager_name: row.bill_manager_name == null ? null : String(row.bill_manager_name),
      loader_name: row.loader_name == null ? null : String(row.loader_name),
      status: String(row.status ?? "-"),
      total_weight_grams: toNumber(row.total_weight_grams),
      optimized: Boolean(row.optimized ?? false),
      route_provider: row.route_provider == null ? null : String(row.route_provider),
      created_at: String(row.created_at ?? ""),
      stops: asArray(row.stops).map((stop) => ({
        stop_id: String(stop.stop_id ?? ""),
        sales_final_invoice_id: String(stop.sales_final_invoice_id ?? ""),
        invoice_number: String(stop.invoice_number ?? "-"),
        customer_name: String(stop.customer_name ?? "-"),
        total_amount: toNumber(stop.total_amount),
        total_weight_grams: toNumber(stop.total_weight_grams),
        status: String(stop.status ?? "-"),
        sequence_no: stop.sequence_no == null ? null : toNumber(stop.sequence_no),
        loading_sequence_no: stop.loading_sequence_no == null ? null : toNumber(stop.loading_sequence_no),
        distance_meters: stop.distance_meters == null ? null : toNumber(stop.distance_meters),
        duration_seconds: stop.duration_seconds == null ? null : toNumber(stop.duration_seconds),
        e_invoice_number: stop.e_invoice_number == null ? null : String(stop.e_invoice_number),
        gst_invoice_number: stop.gst_invoice_number == null ? null : String(stop.gst_invoice_number),
        eway_bill_number: stop.eway_bill_number == null ? null : String(stop.eway_bill_number),
        total_boxes_or_bags: stop.total_boxes_or_bags == null ? null : toNumber(stop.total_boxes_or_bags),
        loose_cases: stop.loose_cases == null ? null : toNumber(stop.loose_cases),
        full_cases: stop.full_cases == null ? null : toNumber(stop.full_cases),
      })),
    };
  }, []);

  const loadDeliveryRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const response = asObject(await fetchBackend("/delivery-workflow/delivery-runs"));
      const items = asArray(response.items).map((row) => mapDeliveryRun(asObject(row)));
      setDeliveryRuns(items);
      setSelectedRunId((prev) => (items.some((run) => run.run_id === prev) ? prev : items[0]?.run_id || ""));
    } catch {
      setDeliveryRuns([]);
      setSelectedRunId("");
    } finally {
      setRunsLoading(false);
    }
  }, [mapDeliveryRun]);

  async function allocateSelectedInvoices() {
    if (selectedInvoiceIds.length === 0) {
      toast.error("Select at least one ready-to-dispatch invoice.");
      return;
    }
    if (!allocationDate || !selectedVehicleId) {
      toast.error("Select delivery date and planned vehicle.");
      return;
    }
    setAllocatingRun(true);
    try {
      const response = asObject(
        await postBackend("/delivery-workflow/delivery-runs/allocate", {
          sales_final_invoice_ids: selectedInvoiceIds,
          delivery_date: allocationDate,
          vehicle_id: selectedVehicleId,
        })
      );
      store.dispatch(
        invalidateByPrefixes([
          "/sales/sales-final-invoices",
          "/delivery-workflow/delivery-runs",
          "/delivery-workflow/notifications",
        ])
      );
      toast.success(`Vehicle run created for ${String(response.delivery_date ?? allocationDate)}.`);
      setAllocationDialogOpen(false);
      setSelectedInvoiceIds([]);
      await loadInvoices(currentPage, invoiceSearch, pageSize);
      await loadDeliveryRuns();
      setSelectedRunId(String(response.run_id ?? ""));
      setRunDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Vehicle allocation failed");
    } finally {
      setAllocatingRun(false);
    }
  }

  async function saveInvoiceDocuments(invoiceId: string) {
    const draft = documentDrafts[invoiceId];
    if (!draft) {
      return;
    }
    setSavingDocumentId(invoiceId);
    try {
      await patchBackend(`/delivery-workflow/sales-final-invoices/${invoiceId}/documents`, draft);
      toast.success("Invoice documents updated.");
      await loadDeliveryRuns();
      await loadInvoices(currentPage, invoiceSearch, pageSize);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update invoice documents");
    } finally {
      setSavingDocumentId(null);
    }
  }

  async function assignSelectedInvoices() {
    if (selectedInvoiceIds.length === 0) {
      toast.error("Select at least one invoice.");
      return;
    }
    setAssigningInvoices(true);
    try {
      const response = asObject(
        await postBackend("/delivery-workflow/invoice-batches/assign", {
          sales_final_invoice_ids: selectedInvoiceIds,
        })
      );
      store.dispatch(
        invalidateByPrefixes(["/sales/sales-final-invoices", "/delivery-workflow/invoice-batches", "/delivery-workflow/notifications"])
      );
      setSelectedInvoiceIds([]);
      toast.success(
        `Assigned ${String(response.invoice_count ?? selectedInvoiceIds.length)} invoices to packers. Batch ${String(
          response.batch_code ?? "-"
        )}.`
      );
      await loadInvoices(currentPage, invoiceSearch, pageSize);
      await loadWorkflowBatches();
      setSelectedBatchId(String(response.batch_id ?? ""));
      setWorkflowDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Assignment failed");
    } finally {
      setAssigningInvoices(false);
    }
  }

  useEffect(() => {
    void loadInvoices(currentPage, invoiceSearch, pageSize);
  }, [currentPage, invoiceSearch, loadInvoices, pageSize]);

  useEffect(() => {
    if (tab === "invoices") {
      void loadWorkflowBatches();
      void loadDeliveryRuns();
    }
  }, [loadDeliveryRuns, loadWorkflowBatches, tab]);

  useEffect(() => {
    if (allocationDialogOpen) {
      void loadVehicleOptions(allocationDate);
    }
  }, [allocationDate, allocationDialogOpen, loadVehicleOptions]);

  useEffect(() => {
    if (!selectedRun) {
      return;
    }
    setDocumentDrafts((prev) => {
      const next = { ...prev };
      for (const stop of selectedRun.stops) {
        next[stop.sales_final_invoice_id] = next[stop.sales_final_invoice_id] ?? {
          e_invoice_number: stop.e_invoice_number ?? "",
          gst_invoice_number: stop.gst_invoice_number ?? "",
          eway_bill_number: stop.eway_bill_number ?? "",
        };
      }
      return next;
    });
  }, [selectedRun]);

  const filteredInvoiceRows = useMemo(() => {
    if (deliveryFilter === "ALL") {
      return invoiceRows;
    }
    return invoiceRows.filter((row) => String(row.delivery_status || "").toUpperCase() === deliveryFilter);
  }, [deliveryFilter, invoiceRows]);

  const allInvoicesSelected =
    filteredInvoiceRows.length > 0 && filteredInvoiceRows.every((row) => selectedInvoiceIds.includes(row.id));
  const selectedBatch = workflowBatches.find((batch) => batch.batch_id === selectedBatchId) ?? workflowBatches[0] ?? null;
  const selectedRun = deliveryRuns.find((run) => run.run_id === selectedRunId) ?? deliveryRuns[0] ?? null;

  function formatWorkflowWeight(grams: number): string {
    if (grams >= 1000) {
      return `${(grams / 1000).toFixed(2)} kg`;
    }
    return `${grams.toFixed(0)} g`;
  }

  function formatMeters(value: number | null): string {
    if (value == null) {
      return "-";
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)} km`;
    }
    return `${Math.round(value)} m`;
  }

  return (
    <>
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
              <select
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={deliveryFilter}
                onChange={(e) => {
                  setDeliveryFilter(e.target.value);
                  setSelectedInvoiceIds([]);
                }}
              >
                <option value="ALL">All Delivery States</option>
                <option value="INVOICE_CREATED">Invoice Created</option>
                <option value="PACKERS_ASSIGNED">Packers Assigned</option>
                <option value="VERIFICATION_PENDING">Verification Pending</option>
                <option value="PACKING_STARTED">Packing Started</option>
                <option value="READY_TO_DISPATCH">Ready To Dispatch</option>
                <option value="VEHICLE_ALLOCATED">Vehicle Allocated</option>
                <option value="LOADED">Loaded</option>
                <option value="DELIVERY_STARTED">Delivery Started</option>
                <option value="DELIVERY_SUCCESSFUL">Delivery Successful</option>
              </select>
              <Button
                onClick={() => void assignSelectedInvoices()}
                disabled={
                  assigningInvoices ||
                  selectedInvoiceIds.length === 0 ||
                  selectedInvoiceIds.some((id) => {
                    const row = filteredInvoiceRows.find((entry) => entry.id === id);
                    return !row || String(row.delivery_status || "").toUpperCase() !== "INVOICE_CREATED";
                  })
                }
              >
                {assigningInvoices ? "Assigning..." : "Assign To Packers"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setAllocationDialogOpen(true)}
                disabled={
                  selectedInvoiceIds.length === 0 ||
                  selectedInvoiceIds.some((id) => {
                    const row = filteredInvoiceRows.find((entry) => entry.id === id);
                    return !row || String(row.delivery_status || "").toUpperCase() !== "READY_TO_DISPATCH";
                  })
                }
              >
                Allocate Vehicle
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
                        onChange={(e) => setSelectedInvoiceIds(e.target.checked ? filteredInvoiceRows.map((row) => row.id) : [])}
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
                  {!invoiceLoading && filteredInvoiceRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No sales invoices found for the selected filter.
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!invoiceLoading &&
                    filteredInvoiceRows.map((row, index) => (
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

            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Delivery Assignment Batches</h3>
                  <p className="text-sm text-muted-foreground">Track packer allocation, verification, and dispatch readiness.</p>
                </div>
                <Button variant="outline" onClick={() => void loadWorkflowBatches()} disabled={workflowLoading}>
                  {workflowLoading ? "Refreshing..." : "Refresh Batches"}
                </Button>
              </div>

              {workflowLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={`workflow-batch-${index}`} className="h-28 w-full" />
                  ))}
                </div>
              ) : workflowBatches.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No delivery batches created yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {workflowBatches.map((batch) => (
                    <button
                      key={batch.batch_id}
                      type="button"
                      onClick={() => {
                        setSelectedBatchId(batch.batch_id);
                        setWorkflowDialogOpen(true);
                      }}
                      className="rounded-xl border p-4 text-left transition hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{batch.batch_code}</p>
                          <p className="text-xs text-muted-foreground">{batch.warehouse_name}</p>
                        </div>
                        <span className="rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide">
                          {batch.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                        <span>{batch.invoice_count} invoices</span>
                        <span>{formatDate(batch.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">Delivery Runs</h3>
                  <p className="text-sm text-muted-foreground">Vehicle allocation, loading state, document readiness, and outlet completion.</p>
                </div>
                <Button variant="outline" onClick={() => void loadDeliveryRuns()} disabled={runsLoading}>
                  {runsLoading ? "Refreshing..." : "Refresh Runs"}
                </Button>
              </div>

              {runsLoading ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={`delivery-run-${index}`} className="h-28 w-full" />
                  ))}
                </div>
              ) : deliveryRuns.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No delivery runs allocated yet.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {deliveryRuns.map((run) => (
                    <button
                      key={run.run_id}
                      type="button"
                      onClick={() => {
                        setSelectedRunId(run.run_id);
                        setRunDialogOpen(true);
                      }}
                      className="rounded-xl border p-4 text-left transition hover:bg-muted/40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{run.vehicle_name || run.registration_no || "Vehicle Run"}</p>
                          <p className="text-xs text-muted-foreground">{run.warehouse_name}</p>
                        </div>
                        <span className="rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide">{run.status.replaceAll("_", " ")}</span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        <p>{run.stops.length} invoices · {formatWorkflowWeight(run.total_weight_grams)}</p>
                        <p>{formatDate(run.created_at)} · {run.delivery_date}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        </CardContent>
      </Card>

      <Dialog open={workflowDialogOpen} onOpenChange={setWorkflowDialogOpen}>
        <DialogContent className="max-h-[85vh] w-[94vw] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedBatch ? selectedBatch.batch_code : "Delivery Batch"}</DialogTitle>
            <DialogDescription>
              {selectedBatch
                ? `${selectedBatch.warehouse_name} · ${selectedBatch.status.replaceAll("_", " ")} · ${selectedBatch.invoice_count} invoices`
                : "Invoice allocation and workflow progress."}
            </DialogDescription>
          </DialogHeader>

          {!selectedBatch ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Select a delivery batch to inspect it.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Warehouse</p>
                  <p className="mt-1 font-medium">{selectedBatch.warehouse_name}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Batch Status</p>
                  <p className="mt-1 font-medium">{selectedBatch.status}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Invoices</p>
                  <p className="mt-1 font-medium">{selectedBatch.invoice_count}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="mt-1 font-medium">{formatDate(selectedBatch.created_at)}</p>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Packer</TableHead>
                      <TableHead>Supervisor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Weight</TableHead>
                      <TableHead>Ready At</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedBatch.invoices.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No invoices linked to this batch.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedBatch.invoices.map((invoice, index) => (
                        <TableRow key={invoice.batch_invoice_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                          <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                          <TableCell>{invoice.customer_name}</TableCell>
                          <TableCell>{invoice.assigned_packer_name}</TableCell>
                          <TableCell>{invoice.assigned_supervisor_name}</TableCell>
                          <TableCell>{invoice.status}</TableCell>
                          <TableCell>{formatWorkflowWeight(invoice.total_weight_grams)}</TableCell>
                          <TableCell>{formatDate(invoice.ready_for_dispatch_at)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={allocationDialogOpen} onOpenChange={setAllocationDialogOpen}>
        <DialogContent className="max-h-[85vh] w-[94vw] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Vehicle Run</DialogTitle>
            <DialogDescription>
              Select delivery date and one planned vehicle assignment. Only ready-to-dispatch invoices should be selected.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <Input type="date" value={allocationDate} onChange={(e) => setAllocationDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Planned Vehicle</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">{vehicleOptionsLoading ? "Loading vehicles..." : "Select vehicle"}</option>
                {vehicleOptions.map((option) => (
                  <option key={option.assignment_id} value={option.vehicle_id}>
                    {option.vehicle_name} ({option.registration_no}){option.capacity_kg != null ? ` · ${option.capacity_kg} kg` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedVehicleId ? (
            <div className="rounded-lg border p-4 text-sm">
              {(() => {
                const option = vehicleOptions.find((item) => item.vehicle_id === selectedVehicleId);
                if (!option) {
                  return <p className="text-muted-foreground">Select a planned vehicle to inspect assigned crew.</p>;
                }
                return (
                  <div className="grid gap-2 md:grid-cols-2">
                    <p><span className="text-muted-foreground">Driver:</span> {option.driver_name || "-"}</p>
                    <p><span className="text-muted-foreground">In Vehicle:</span> {option.in_vehicle_employee_name || "-"}</p>
                    <p><span className="text-muted-foreground">Bill Manager:</span> {option.bill_manager_name || "-"}</p>
                    <p><span className="text-muted-foreground">Loader:</span> {option.loader_name || "-"}</p>
                  </div>
                );
              })()}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-lg border">
            <Table className="w-full table-fixed">
              <TableHeader>
                <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                  <TableHead className="w-[24%]">Invoice</TableHead>
                  <TableHead className="w-[26%]">Customer</TableHead>
                  <TableHead className="w-[16%]">Delivery Status</TableHead>
                  <TableHead className="w-[14%]">Items</TableHead>
                  <TableHead className="w-[20%]">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoiceRows
                  .filter((row) => selectedInvoiceIds.includes(row.id))
                  .map((row, index) => (
                    <TableRow key={row.id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell className="truncate">{row.invoice_number}</TableCell>
                      <TableCell className="truncate">{row.customer_name}</TableCell>
                      <TableCell>{row.delivery_status}</TableCell>
                      <TableCell>{row.item_count}</TableCell>
                      <TableCell>INR {formatPrice(row.total_amount)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setAllocationDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => void allocateSelectedInvoices()} disabled={allocatingRun || !selectedVehicleId || !allocationDate}>
              {allocatingRun ? "Allocating..." : "Create Vehicle Run"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={runDialogOpen} onOpenChange={setRunDialogOpen}>
        <DialogContent className="max-h-[88vh] w-[96vw] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedRun ? `${selectedRun.vehicle_name || "Vehicle Run"} · ${selectedRun.delivery_date}` : "Delivery Run"}</DialogTitle>
            <DialogDescription>
              {selectedRun
                ? `${selectedRun.warehouse_name} · ${selectedRun.status.replaceAll("_", " ")} · ${selectedRun.stops.length} invoices`
                : "Inspect allocated run, route order, and document readiness."}
            </DialogDescription>
          </DialogHeader>

          {!selectedRun ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              Select a delivery run to inspect it.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Vehicle</p><p className="mt-1 font-medium">{selectedRun.vehicle_name || "-"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Registration</p><p className="mt-1 font-medium">{selectedRun.registration_no || "-"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Capacity</p><p className="mt-1 font-medium">{selectedRun.capacity_kg != null ? `${selectedRun.capacity_kg} kg` : "-"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Run Weight</p><p className="mt-1 font-medium">{formatWorkflowWeight(selectedRun.total_weight_grams)}</p></div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Driver</p><p className="mt-1 font-medium">{selectedRun.driver_name || "-"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">In Vehicle</p><p className="mt-1 font-medium">{selectedRun.in_vehicle_employee_name || "-"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Bill Manager</p><p className="mt-1 font-medium">{selectedRun.bill_manager_name || "-"}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Loader</p><p className="mt-1 font-medium">{selectedRun.loader_name || "-"}</p></div>
              </div>

              <div className="overflow-hidden rounded-lg border">
                <Table className="w-full table-fixed">
                  <TableHeader>
                    <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                      <TableHead className="w-[14%]">Invoice</TableHead>
                      <TableHead className="w-[18%]">Customer</TableHead>
                      <TableHead className="w-[10%]">Order</TableHead>
                      <TableHead className="w-[10%]">Load</TableHead>
                      <TableHead className="w-[11%]">Distance</TableHead>
                      <TableHead className="w-[11%]">Status</TableHead>
                      <TableHead className="w-[8%]">E Inv</TableHead>
                      <TableHead className="w-[8%]">GST Inv</TableHead>
                      <TableHead className="w-[8%]">Eway</TableHead>
                      <TableHead className="w-[12%]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedRun.stops.map((stop, index) => {
                      const draft = documentDrafts[stop.sales_final_invoice_id] ?? {
                        e_invoice_number: stop.e_invoice_number ?? "",
                        gst_invoice_number: stop.gst_invoice_number ?? "",
                        eway_bill_number: stop.eway_bill_number ?? "",
                      };
                      return (
                        <TableRow key={stop.stop_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                          <TableCell className="truncate">{stop.invoice_number}</TableCell>
                          <TableCell className="truncate">{stop.customer_name}</TableCell>
                          <TableCell>{stop.sequence_no ?? "-"}</TableCell>
                          <TableCell>{stop.loading_sequence_no ?? "-"}</TableCell>
                          <TableCell>{formatMeters(stop.distance_meters)}</TableCell>
                          <TableCell>{stop.status}</TableCell>
                          <TableCell>
                            <Input
                              value={draft.e_invoice_number}
                              onChange={(e) =>
                                setDocumentDrafts((prev) => ({
                                  ...prev,
                                  [stop.sales_final_invoice_id]: { ...draft, e_invoice_number: e.target.value },
                                }))
                              }
                              placeholder="Required"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={draft.gst_invoice_number}
                              onChange={(e) =>
                                setDocumentDrafts((prev) => ({
                                  ...prev,
                                  [stop.sales_final_invoice_id]: { ...draft, gst_invoice_number: e.target.value },
                                }))
                              }
                              placeholder="Required"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={draft.eway_bill_number}
                              onChange={(e) =>
                                setDocumentDrafts((prev) => ({
                                  ...prev,
                                  [stop.sales_final_invoice_id]: { ...draft, eway_bill_number: e.target.value },
                                }))
                              }
                              placeholder="Required"
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void saveInvoiceDocuments(stop.sales_final_invoice_id)}
                              disabled={savingDocumentId === stop.sales_final_invoice_id}
                            >
                              {savingDocumentId === stop.sales_final_invoice_id ? "Saving..." : "Save Docs"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
