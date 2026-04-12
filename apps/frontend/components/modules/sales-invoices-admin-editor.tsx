"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, fetchBackendFresh, fetchPortalMe, patchBackend, postBackend } from "@/lib/backend-api";
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
import { SalesEntryWorkspace } from "@/components/modules/sales-entry-workspace";

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

type DirectCustomerOption = {
  id: string;
  name: string;
};

type DirectWarehouseOption = {
  id: string;
  name: string;
};

type DirectProductOption = {
  id: string;
  sku: string;
  name: string;
};

type DirectBillItem = {
  product_id: string;
  sku: string;
  name: string;
  quantity: string;
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

type SalesInvoicesAdminEditorProps = {
  initialSalesOrderId?: string;
  onConsumedInitial?: () => void;
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

function formatDate(value: string | null | undefined): string {
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

export function SalesInvoicesAdminEditor({ initialSalesOrderId, onConsumedInitial }: SalesInvoicesAdminEditorProps) {
  const { state: persistedUiState, setState: setPersistedUiState } = usePersistedUiState(
    "sales-invoices-admin-ui",
    defaultUiState
  );
  const [tab, setTab] = useState(persistedUiState.tab);
  const [createMode, setCreateMode] = useState<"challan" | "direct">("challan");

  const [directCustomerId, setDirectCustomerId] = useState("");
  const [directWarehouseId, setDirectWarehouseId] = useState("");
  const [directInvoiceDate, setDirectInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [directProductSearch, setDirectProductSearch] = useState("");
  const [directProductResults, setDirectProductResults] = useState<DirectProductOption[]>([]);
  const [directItems, setDirectItems] = useState<DirectBillItem[]>([]);
  const [directLoadingProducts, setDirectLoadingProducts] = useState(false);
  const [directCreating, setDirectCreating] = useState(false);
  const [directCustomers, setDirectCustomers] = useState<DirectCustomerOption[]>([]);
  const [directWarehouses, setDirectWarehouses] = useState<DirectWarehouseOption[]>([]);
  const [showDirectCustomerCreate, setShowDirectCustomerCreate] = useState(false);
  const [creatingDirectCustomer, setCreatingDirectCustomer] = useState(false);
  const [newCustomerForm, setNewCustomerForm] = useState({
    name: "",
    phone: "",
    gstin: "",
    street_address_1: "",
    city: "",
    state: "",
    pincode: "",
  });

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
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadSales, setCanReadSales] = useState(false);
  const [canWriteSales, setCanWriteSales] = useState(false);
  const [canReadDelivery, setCanReadDelivery] = useState(false);
  const [canWriteDelivery, setCanWriteDelivery] = useState(false);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "sales-final-invoices-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = asObject(await fetchPortalMe());
        const isSuperAdmin = Boolean(payload.is_super_admin);
        const permissions = asObject(payload.admin_permissions);
        const salesPermission = asObject(permissions.sales);
        const deliveryPermission = asObject(permissions.delivery);
        if (!active) {
          return;
        }
        setCanReadSales(isSuperAdmin || Boolean(salesPermission.read) || Boolean(salesPermission.write));
        setCanWriteSales(isSuperAdmin || Boolean(salesPermission.write));
        setCanReadDelivery(isSuperAdmin || Boolean(deliveryPermission.read) || Boolean(deliveryPermission.write));
        setCanWriteDelivery(isSuperAdmin || Boolean(deliveryPermission.write));
        setPermissionsLoaded(true);
      } catch {
        if (!active) {
          return;
        }
        setCanReadSales(false);
        setCanWriteSales(false);
        setCanReadDelivery(false);
        setCanWriteDelivery(false);
        setPermissionsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setPersistedUiState({
      tab,
      customerSearchInput: "",
      selectedCustomerId: "",
      selectedCustomerName: "",
      selectedOrderId: "",
      invoiceDate: new Date().toISOString().slice(0, 10),
      invoiceSearchInput,
      invoiceSearch,
      deliveryFilter,
      allocationDate,
      selectedVehicleId,
    });
  }, [
    allocationDate,
    deliveryFilter,
    invoiceSearch,
    invoiceSearchInput,
    selectedVehicleId,
    setPersistedUiState,
    tab,
  ]);

  useEffect(() => {
    if (initialSalesOrderId) {
      setTab("create");
      setCreateMode("challan");
    }
  }, [initialSalesOrderId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [customersRes, warehousesRes] = await Promise.all([
          fetchBackendFresh("/masters/customers?page=1&page_size=200"),
          fetchBackendFresh("/masters/warehouses?page=1&page_size=200"),
        ]);
        if (!active) return;
        const customers = asArray(customersRes.items ?? customersRes).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? row.display_name ?? "-"),
        }));
        const warehouses = asArray(warehousesRes.items ?? warehousesRes).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? "-"),
        }));
        setDirectCustomers(customers);
        setDirectWarehouses(warehouses);
      } catch {
        if (!active) return;
        setDirectCustomers([]);
        setDirectWarehouses([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadInvoices = useCallback(async (page: number, searchText: string, size = pageSize) => {
    if (!canReadSales) {
      setInvoiceRows([]);
      setInvoiceTotalCount(0);
      setInvoiceTotalPages(0);
      setInvoiceLoading(false);
      return;
    }
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
  }, [pageSize, canReadSales]);

  useEffect(() => {
    const term = directProductSearch.trim();
    if (term.length < 3) {
      setDirectProductResults([]);
      return;
    }
    let active = true;
    setDirectLoadingProducts(true);
    void (async () => {
      try {
        const params = new URLSearchParams();
        params.set("search", term);
        params.set("page", "1");
        params.set("page_size", "30");
        const res = asObject(await fetchBackendFresh(`/masters/products?${params.toString()}`));
        const items = asArray(res.items).map((row) => ({
          id: String(row.id ?? ""),
          sku: String(row.sku ?? "-"),
          name: String(row.name ?? "-"),
        }));
        if (active) {
          setDirectProductResults(items);
        }
      } catch {
        if (active) {
          setDirectProductResults([]);
        }
      } finally {
        if (active) {
          setDirectLoadingProducts(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [directProductSearch]);

  function addDirectItem(product: DirectProductOption) {
    setDirectItems((prev) => {
      const existing = prev.find((row) => row.product_id === product.id);
      if (existing) {
        return prev.map((row) =>
          row.product_id === product.id ? { ...row, quantity: String(Number(row.quantity || "0") + 1) } : row
        );
      }
      return [...prev, { product_id: product.id, sku: product.sku, name: product.name, quantity: "1" }];
    });
  }

  function removeDirectItem(index: number) {
    setDirectItems((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function createDirectInvoice() {
    if (!canWriteSales || directCreating) return;
    if (!directCustomerId || !directWarehouseId || directItems.length === 0) {
      toast.error("Customer, warehouse and at least one item are required.");
      return;
    }
    setDirectCreating(true);
    try {
      await postBackend("/sales/sales-final-invoices/direct", {
        customer_id: directCustomerId,
        warehouse_id: directWarehouseId,
        invoice_date: directInvoiceDate,
        items: directItems.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity || 0),
        })),
      });
      toast.success("Direct sales bill created.");
      setDirectItems([]);
      setDirectProductSearch("");
      setDirectProductResults([]);
      setCurrentPage(1);
      void loadInvoices(1, invoiceSearch, pageSize);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create direct sales bill");
    } finally {
      setDirectCreating(false);
    }
  }

  async function createDirectCustomer() {
    if (!newCustomerForm.name.trim()) {
      toast.error("Customer name is required.");
      return;
    }
    setCreatingDirectCustomer(true);
    try {
      const payload = {
        name: newCustomerForm.name.trim(),
        phone: newCustomerForm.phone.trim() || null,
        gstin: newCustomerForm.gstin.trim() || null,
        street_address_1: newCustomerForm.street_address_1.trim() || null,
        city: newCustomerForm.city.trim() || null,
        state: newCustomerForm.state.trim() || null,
        pincode: newCustomerForm.pincode.trim() || null,
      };
      const created = await postBackend("/masters/customers", payload);
      const newId = String(created?.id ?? "");
      setDirectCustomers((prev) => [
        ...prev,
        { id: newId, name: String(created?.name ?? payload.name) },
      ]);
      if (newId) {
        setDirectCustomerId(newId);
      }
      setNewCustomerForm({
        name: "",
        phone: "",
        gstin: "",
        street_address_1: "",
        city: "",
        state: "",
        pincode: "",
      });
      setShowDirectCustomerCreate(false);
      toast.success("Customer created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create customer");
    } finally {
      setCreatingDirectCustomer(false);
    }
  }

  const loadWorkflowBatches = useCallback(async () => {
    if (!canReadDelivery) {
      setWorkflowBatches([]);
      setSelectedBatchId("");
      setWorkflowLoading(false);
      return;
    }
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
  }, [canReadDelivery]);

  const loadVehicleOptions = useCallback(async (dutyDate: string) => {
    if (!canReadDelivery) {
      setVehicleOptions([]);
      return;
    }
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
  }, [canReadDelivery]);

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
    if (!canReadDelivery) {
      setDeliveryRuns([]);
      setSelectedRunId("");
      setRunsLoading(false);
      return;
    }
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
  }, [mapDeliveryRun, canReadDelivery]);

  async function allocateSelectedInvoices() {
    if (!canWriteDelivery) {
      return;
    }
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
    if (!canWriteDelivery) {
      return;
    }
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
    if (!canWriteDelivery) {
      return;
    }
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
    if (!permissionsLoaded || !canReadSales) {
      setInvoiceLoading(false);
      return;
    }
    void loadInvoices(currentPage, invoiceSearch, pageSize);
  }, [currentPage, invoiceSearch, loadInvoices, pageSize, permissionsLoaded, canReadSales]);

  useEffect(() => {
    if (tab === "invoices" && canReadDelivery) {
      void loadWorkflowBatches();
      void loadDeliveryRuns();
    }
  }, [loadDeliveryRuns, loadWorkflowBatches, tab, canReadDelivery]);

  useEffect(() => {
    if (allocationDialogOpen && canReadDelivery) {
      void loadVehicleOptions(allocationDate);
    }
  }, [allocationDate, allocationDialogOpen, loadVehicleOptions, canReadDelivery]);

  const selectedRun = deliveryRuns.find((run) => run.run_id === selectedRunId) ?? deliveryRuns[0] ?? null;

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
      {permissionsLoaded && !canReadSales ? (
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              You do not have access to the Sales Bills module.
            </div>
          </CardContent>
        </Card>
      ) : null}
      {!permissionsLoaded || canReadSales ? (
      <Card>
        <CardHeader>
          <CardTitle>Sales Bills</CardTitle>
        </CardHeader>
        <CardContent>
        {permissionsLoaded && canReadSales && !canWriteSales ? (
          <div className="mb-4 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Read-only access. Invoice creation is disabled for your admin role.
          </div>
        ) : null}
        {permissionsLoaded && canReadSales && !canReadDelivery ? (
          <div className="mb-4 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Delivery workflow sections are hidden because your admin role does not include delivery access.
          </div>
        ) : null}
        {permissionsLoaded && canReadDelivery && !canWriteDelivery ? (
          <div className="mb-4 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Delivery workflow is read-only for your admin role.
          </div>
        ) : null}
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="create">Create Invoice</TabsTrigger>
            <TabsTrigger value="invoices">Sales Bills</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-4">
            <Tabs value={createMode} onValueChange={(value) => setCreateMode(value === "direct" ? "direct" : "challan")}>
              <TabsList>
                <TabsTrigger value="challan">From Sales Challan</TabsTrigger>
                <TabsTrigger value="direct">Direct Sales Bill</TabsTrigger>
              </TabsList>
              <TabsContent value="challan" className="space-y-4">
                <SalesEntryWorkspace
                  canWriteSales={canWriteSales}
                  initialOrderId={initialSalesOrderId}
                  onConsumedInitial={onConsumedInitial}
                  onCreated={() => {
                    setCurrentPage(1);
                    void loadInvoices(1, invoiceSearch, pageSize);
                  }}
                />
              </TabsContent>
              <TabsContent value="direct" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Direct Sales Bill</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-1 md:col-span-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Customer *</Label>
                          <Button size="sm" variant="outline" type="button" onClick={() => setShowDirectCustomerCreate(true)}>
                            + Add Customer
                          </Button>
                        </div>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={directCustomerId}
                          onChange={(e) => setDirectCustomerId(e.target.value)}
                        >
                          <option value="">{directCustomers.length ? "Select customer" : "No customers found"}</option>
                          {directCustomers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Warehouse *</Label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={directWarehouseId}
                          onChange={(e) => setDirectWarehouseId(e.target.value)}
                        >
                          <option value="">{directWarehouses.length ? "Select warehouse" : "No warehouses found"}</option>
                          {directWarehouses.map((warehouse) => (
                            <option key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Invoice Date *</Label>
                        <Input type="date" value={directInvoiceDate} onChange={(e) => setDirectInvoiceDate(e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Add Products *</Label>
                      <Input
                        value={directProductSearch}
                        onChange={(e) => setDirectProductSearch(e.target.value)}
                        placeholder="Type first 3 letters of SKU or name"
                      />
                      {directLoadingProducts ? <p className="text-xs text-muted-foreground">Searching products...</p> : null}
                      {directProductResults.length > 0 ? (
                        <div className="max-h-52 overflow-y-auto rounded-md border">
                          {directProductResults.map((product) => (
                            <div key={product.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{product.sku || "-"}</p>
                                <p className="truncate text-xs text-muted-foreground">{product.name || "-"}</p>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => addDirectItem(product)}>
                                Add
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {directItems.length > 0 ? (
                      <div className="space-y-2">
                        {directItems.map((row, index) => (
                          <div key={`${row.product_id}-${index}`} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-12 md:items-end">
                            <div className="md:col-span-4">
                              <p className="text-xs text-muted-foreground">SKU</p>
                              <p className="font-medium">{row.sku || "-"}</p>
                            </div>
                            <div className="md:col-span-4">
                              <p className="text-xs text-muted-foreground">Name</p>
                              <p className="font-medium">{row.name || "-"}</p>
                            </div>
                            <div className="md:col-span-2">
                              <p className="mb-1 text-xs text-muted-foreground">Quantity</p>
                              <Input
                                value={row.quantity}
                                onChange={(e) =>
                                  setDirectItems((prev) =>
                                    prev.map((item, idx) => (idx === index ? { ...item, quantity: e.target.value } : item))
                                  )
                                }
                              />
                            </div>
                            <div className="md:col-span-2">
                              <p className="mb-1 text-xs text-muted-foreground">Action</p>
                              <Button size="sm" variant="outline" onClick={() => removeDirectItem(index)}>
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                        Search and add products to create a direct sales bill.
                      </p>
                    )}

                    <Button
                      onClick={() => void createDirectInvoice()}
                      disabled={!canWriteSales || directCreating || !directCustomerId || !directWarehouseId || directItems.length === 0}
                    >
                      {directCreating ? "Creating..." : "Create Direct Bill"}
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
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
                  !canWriteDelivery ||
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
                  !canWriteDelivery ||
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
                        disabled={!canWriteDelivery}
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
                        No sales bills found for the selected filter.
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
                            disabled={!canWriteDelivery}
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

            {canReadDelivery ? (
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
            ) : null}

            {canReadDelivery ? (
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
            ) : null}
          </TabsContent>
        </Tabs>

        <Dialog open={showDirectCustomerCreate} onOpenChange={setShowDirectCustomerCreate}>
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
              <Button onClick={() => void createDirectCustomer()} disabled={creatingDirectCustomer || !newCustomerForm.name.trim()}>
                {creatingDirectCustomer ? "Adding..." : "Add Customer"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
      ) : null}

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
              <Input type="date" value={allocationDate} onChange={(e) => setAllocationDate(e.target.value)} disabled={!canWriteDelivery} />
            </div>
            <div className="space-y-2">
              <Label>Planned Vehicle</Label>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedVehicleId}
                disabled={!canWriteDelivery}
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
            <Button onClick={() => void allocateSelectedInvoices()} disabled={!canWriteDelivery || allocatingRun || !selectedVehicleId || !allocationDate}>
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
                              disabled={!canWriteDelivery}
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
                              disabled={!canWriteDelivery}
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
                              disabled={!canWriteDelivery}
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
                              disabled={!canWriteDelivery || savingDocumentId === stop.sales_final_invoice_id}
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
