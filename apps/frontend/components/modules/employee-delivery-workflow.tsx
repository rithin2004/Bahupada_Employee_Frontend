"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { asArray, asObject, fetchBackend, fetchPortalMe, patchBackend, postBackend } from "@/lib/backend-api";

type Mode = "packing" | "delivery";

type MeResponse = {
  user_id: string;
  full_name: string;
  employee_role: string | null;
};

type WorkflowItem = {
  sales_final_invoice_item_id: string;
  execution_item_id: string | null;
  product_id: string;
  sku: string;
  product_name: string;
  unit: string;
  mrp: number | null;
  quantity: number;
  actual_quantity: number;
  shortfall_quantity: number;
  shortfall_reason: string | null;
  supervisor_decision: string | null;
  supervisor_note: string | null;
  case_size: number | null;
};

type WorkflowInvoice = {
  batch_invoice_id: string;
  sales_final_invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string;
  customer_name: string;
  warehouse_id: string;
  warehouse_name: string;
  assigned_packer_id: string;
  assigned_packer_name: string;
  assigned_supervisor_id: string;
  assigned_supervisor_name: string;
  total_weight_grams: number;
  total_amount: number;
  status: string;
  requested_verification_at: string | null;
  verified_at: string | null;
  rejected_at: string | null;
  rejection_note: string | null;
  ready_for_dispatch_at: string | null;
  total_boxes_or_bags: number | null;
  loose_cases: number | null;
  full_cases: number | null;
  packing_note: string | null;
  items: WorkflowItem[];
};

type WorkflowBatch = {
  batch_id: string;
  batch_code: string;
  warehouse_id: string;
  warehouse_name: string;
  status: string;
  created_at: string;
  invoice_count: number;
  invoices: WorkflowInvoice[];
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
  items: WorkflowItem[];
};

type DeliveryRun = {
  run_id: string;
  warehouse_name: string;
  delivery_date: string;
  vehicle_name: string | null;
  registration_no: string | null;
  driver_name: string | null;
  in_vehicle_employee_name: string | null;
  bill_manager_name: string | null;
  loader_name: string | null;
  status: string;
  total_weight_grams: number;
  optimized: boolean;
  route_provider: string | null;
  google_maps_url: string | null;
  total_duration_seconds: number | null;
  created_at: string;
  stops: DeliveryRunStop[];
};

type ExecutionDraft = {
  actual_quantity: string;
  shortfall_reason: string;
};

type PackingDraft = {
  total_boxes_or_bags: string;
  loose_cases: string;
  full_cases: string;
  packing_note: string;
};

const SHORTFALL_REASONS = ["DAMAGED_PRODUCTS", "NO_STOCK_AVAILABLE"];

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

function formatWeight(grams: number): string {
  if (grams >= 1000) {
    return `${(grams / 1000).toFixed(2)} kg`;
  }
  return `${grams.toFixed(0)} g`;
}

function formatPrice(value: number | null | undefined): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : "0.00";
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) {
    return "-";
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function normalizeBatches(payload: unknown): WorkflowBatch[] {
  return asArray(asObject(payload).items).map((batch) => ({
    batch_id: String(batch.batch_id ?? ""),
    batch_code: String(batch.batch_code ?? "-"),
    warehouse_id: String(batch.warehouse_id ?? ""),
    warehouse_name: String(batch.warehouse_name ?? "-"),
    status: String(batch.status ?? "-"),
    created_at: String(batch.created_at ?? ""),
    invoice_count: toNumber(batch.invoice_count),
    invoices: asArray(batch.invoices).map((invoice) => ({
      batch_invoice_id: String(invoice.batch_invoice_id ?? ""),
      sales_final_invoice_id: String(invoice.sales_final_invoice_id ?? ""),
      invoice_number: String(invoice.invoice_number ?? "-"),
      invoice_date: String(invoice.invoice_date ?? ""),
      customer_id: String(invoice.customer_id ?? ""),
      customer_name: String(invoice.customer_name ?? "-"),
      warehouse_id: String(invoice.warehouse_id ?? ""),
      warehouse_name: String(invoice.warehouse_name ?? "-"),
      assigned_packer_id: String(invoice.assigned_packer_id ?? ""),
      assigned_packer_name: String(invoice.assigned_packer_name ?? "-"),
      assigned_supervisor_id: String(invoice.assigned_supervisor_id ?? ""),
      assigned_supervisor_name: String(invoice.assigned_supervisor_name ?? "-"),
      total_weight_grams: toNumber(invoice.total_weight_grams),
      total_amount: toNumber(invoice.total_amount),
      status: String(invoice.status ?? "-"),
      requested_verification_at: typeof invoice.requested_verification_at === "string" ? invoice.requested_verification_at : null,
      verified_at: typeof invoice.verified_at === "string" ? invoice.verified_at : null,
      rejected_at: typeof invoice.rejected_at === "string" ? invoice.rejected_at : null,
      rejection_note: typeof invoice.rejection_note === "string" ? invoice.rejection_note : null,
      ready_for_dispatch_at: typeof invoice.ready_for_dispatch_at === "string" ? invoice.ready_for_dispatch_at : null,
      total_boxes_or_bags: invoice.total_boxes_or_bags == null ? null : toNumber(invoice.total_boxes_or_bags),
      loose_cases: invoice.loose_cases == null ? null : toNumber(invoice.loose_cases),
      full_cases: invoice.full_cases == null ? null : toNumber(invoice.full_cases),
      packing_note: typeof invoice.packing_note === "string" ? invoice.packing_note : null,
      items: asArray(invoice.items).map((item) => ({
        sales_final_invoice_item_id: String(item.sales_final_invoice_item_id ?? ""),
        execution_item_id: item.execution_item_id == null ? null : String(item.execution_item_id),
        product_id: String(item.product_id ?? ""),
        sku: String(item.sku ?? "-"),
        product_name: String(item.product_name ?? "-"),
        unit: String(item.unit ?? "-"),
        mrp: item.mrp == null ? null : toNumber(item.mrp),
        quantity: toNumber(item.quantity),
        actual_quantity: toNumber(item.actual_quantity),
        shortfall_quantity: toNumber(item.shortfall_quantity),
        shortfall_reason: typeof item.shortfall_reason === "string" ? item.shortfall_reason : null,
        supervisor_decision: typeof item.supervisor_decision === "string" ? item.supervisor_decision : null,
        supervisor_note: typeof item.supervisor_note === "string" ? item.supervisor_note : null,
        case_size: item.case_size == null ? null : toNumber(item.case_size),
      })),
    })),
  }));
}

function normalizeRuns(payload: unknown): DeliveryRun[] {
  return asArray(asObject(payload).items).map((run) => ({
    run_id: String(run.run_id ?? ""),
    warehouse_name: String(run.warehouse_name ?? "-"),
    delivery_date: String(run.delivery_date ?? ""),
    vehicle_name: run.vehicle_name == null ? null : String(run.vehicle_name),
    registration_no: run.registration_no == null ? null : String(run.registration_no),
    driver_name: run.driver_name == null ? null : String(run.driver_name),
    in_vehicle_employee_name: run.in_vehicle_employee_name == null ? null : String(run.in_vehicle_employee_name),
    bill_manager_name: run.bill_manager_name == null ? null : String(run.bill_manager_name),
    loader_name: run.loader_name == null ? null : String(run.loader_name),
    status: String(run.status ?? "-"),
    total_weight_grams: toNumber(run.total_weight_grams),
    optimized: Boolean(run.optimized ?? false),
    route_provider: run.route_provider == null ? null : String(run.route_provider),
    google_maps_url: run.google_maps_url == null ? null : String(run.google_maps_url),
    total_duration_seconds: run.total_duration_seconds == null ? null : toNumber(run.total_duration_seconds),
    created_at: String(run.created_at ?? ""),
    stops: asArray(run.stops).map((stop) => ({
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
      items: asArray(stop.items).map((item) => ({
        sales_final_invoice_item_id: String(item.sales_final_invoice_item_id ?? ""),
        execution_item_id: item.execution_item_id == null ? null : String(item.execution_item_id),
        product_id: String(item.product_id ?? ""),
        sku: String(item.sku ?? "-"),
        product_name: String(item.product_name ?? "-"),
        unit: String(item.unit ?? "-"),
        mrp: item.mrp == null ? null : toNumber(item.mrp),
        quantity: toNumber(item.quantity),
        actual_quantity: toNumber(item.actual_quantity),
        shortfall_quantity: toNumber(item.shortfall_quantity),
        shortfall_reason: typeof item.shortfall_reason === "string" ? item.shortfall_reason : null,
        supervisor_decision: typeof item.supervisor_decision === "string" ? item.supervisor_decision : null,
        supervisor_note: typeof item.supervisor_note === "string" ? item.supervisor_note : null,
        case_size: item.case_size == null ? null : toNumber(item.case_size),
      })),
    })),
  }));
}

export function EmployeeDeliveryWorkflow({ mode }: { mode: Mode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<WorkflowBatch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [activeInvoiceId, setActiveInvoiceId] = useState("");
  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [activeRunId, setActiveRunId] = useState("");
  const [activeStopId, setActiveStopId] = useState("");
  const [executionDrafts, setExecutionDrafts] = useState<Record<string, ExecutionDraft>>({});
  const [packingDrafts, setPackingDrafts] = useState<Record<string, PackingDraft>>({});
  const [submittingExecution, setSubmittingExecution] = useState(false);
  const [submittingPacking, setSubmittingPacking] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [runActionBusy, setRunActionBusy] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const meResponse = asObject(await fetchPortalMe());
      const meData = {
        user_id: String(meResponse.user_id ?? ""),
        full_name: String(meResponse.full_name ?? "Employee User"),
        employee_role: meResponse.employee_role == null ? null : String(meResponse.employee_role),
      };
      setMe(meData);
      if (mode === "delivery") {
        const endpoint =
          meData.employee_role === "SUPERVISOR"
            ? "/delivery-workflow/delivery-runs/supervisor/current"
            : meData.employee_role === "DRIVER"
              ? "/delivery-workflow/delivery-runs/driver/current"
              : meData.employee_role === "BILL_MANAGER"
                ? "/delivery-workflow/delivery-runs/bill-manager/current"
                : "/delivery-workflow/delivery-runs/delivery-helper/current";
        const rows = normalizeRuns(await fetchBackend(endpoint));
        setRuns(rows);
        setActiveRunId((prev) => (rows.some((row) => row.run_id === prev) ? prev : rows[0]?.run_id || ""));
      } else {
        const endpoint =
          meData.employee_role === "SUPERVISOR"
            ? "/delivery-workflow/supervisor/pending-batches"
            : "/delivery-workflow/my-packing-batches";
        const rows = normalizeBatches(await fetchBackend(endpoint));
        setBatches(rows);
        setActiveBatchId((prev) => (rows.some((row) => row.batch_id === prev) ? prev : rows[0]?.batch_id || ""));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load delivery workflow");
      setBatches([]);
      setActiveBatchId("");
      setRuns([]);
      setActiveRunId("");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const activeBatch = useMemo(
    () => batches.find((batch) => batch.batch_id === activeBatchId) ?? batches[0] ?? null,
    [activeBatchId, batches]
  );

  useEffect(() => {
    if (!activeBatch) {
      setActiveInvoiceId("");
      return;
    }
    setActiveInvoiceId((prev) =>
      activeBatch.invoices.some((invoice) => invoice.batch_invoice_id === prev) ? prev : activeBatch.invoices[0]?.batch_invoice_id || ""
    );
  }, [activeBatch]);

  const activeInvoice = useMemo(
    () => activeBatch?.invoices.find((invoice) => invoice.batch_invoice_id === activeInvoiceId) ?? activeBatch?.invoices[0] ?? null,
    [activeBatch, activeInvoiceId]
  );

  const activeRun = useMemo(
    () => runs.find((run) => run.run_id === activeRunId) ?? runs[0] ?? null,
    [activeRunId, runs]
  );

  useEffect(() => {
    if (!activeRun) {
      setActiveStopId("");
      return;
    }
    setActiveStopId((prev) => (activeRun.stops.some((stop) => stop.stop_id === prev) ? prev : activeRun.stops[0]?.stop_id || ""));
  }, [activeRun]);

  const activeStop = useMemo(
    () => activeRun?.stops.find((stop) => stop.stop_id === activeStopId) ?? activeRun?.stops[0] ?? null,
    [activeRun, activeStopId]
  );

  useEffect(() => {
    if (!activeInvoice) {
      return;
    }
    setExecutionDrafts((prev) => {
      const next = { ...prev };
      for (const item of activeInvoice.items) {
        if (!next[item.sales_final_invoice_item_id]) {
          next[item.sales_final_invoice_item_id] = {
            actual_quantity: String(item.actual_quantity || item.quantity),
            shortfall_reason: item.shortfall_reason || "",
          };
        }
      }
      return next;
    });
    setPackingDrafts((prev) => ({
      ...prev,
      [activeInvoice.batch_invoice_id]: prev[activeInvoice.batch_invoice_id] ?? {
        total_boxes_or_bags: String(activeInvoice.total_boxes_or_bags ?? 0),
        loose_cases: String(activeInvoice.loose_cases ?? 0),
        full_cases: String(activeInvoice.full_cases ?? 0),
        packing_note: activeInvoice.packing_note ?? "",
      },
    }));
  }, [activeInvoice]);

  async function persistExecution(options?: { silent?: boolean; reload?: boolean }) {
    if (!activeInvoice) {
      return;
    }
    try {
      await patchBackend(`/delivery-workflow/batch-invoices/${activeInvoice.batch_invoice_id}/execution`, {
        items: activeInvoice.items.map((item) => {
          const draft = executionDrafts[item.sales_final_invoice_item_id] ?? {
            actual_quantity: String(item.quantity),
            shortfall_reason: "",
          };
          return {
            sales_final_invoice_item_id: item.sales_final_invoice_item_id,
            actual_quantity: Math.max(0, Math.min(item.quantity, toNumber(draft.actual_quantity))),
            shortfall_reason:
              toNumber(draft.actual_quantity) < item.quantity ? draft.shortfall_reason || null : null,
          };
        }),
      });
      if (!options?.silent) {
        toast.success("Execution quantities updated.");
      }
      if (options?.reload ?? true) {
        await loadData();
      }
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "Failed to update execution");
      }
      throw error;
    }
  }

  async function saveExecution() {
    if (!activeInvoice) {
      return;
    }
    setSubmittingExecution(true);
    try {
      await persistExecution();
    } finally {
      setSubmittingExecution(false);
    }
  }

  async function requestVerification() {
    if (!activeInvoice) {
      return;
    }
    setSubmittingExecution(true);
    try {
      await persistExecution({ silent: true, reload: false });
      await postBackend(`/delivery-workflow/batch-invoices/${activeInvoice.batch_invoice_id}/request-verification`, {});
      toast.success("Verification requested.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to request verification");
    } finally {
      setSubmittingExecution(false);
    }
  }

  async function verifyOrReject(action: "verify" | "reject") {
    if (!activeInvoice) {
      return;
    }
    setDecisionBusy(true);
    try {
      await postBackend(`/delivery-workflow/supervisor/batch-invoices/${activeInvoice.batch_invoice_id}/${action}`, { note: null });
      toast.success(action === "verify" ? "Invoice verified." : "Invoice rejected and sent back.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} invoice`);
    } finally {
      setDecisionBusy(false);
    }
  }

  async function persistPacking(options?: { silent?: boolean; reload?: boolean }) {
    if (!activeInvoice) {
      return;
    }
    const draft = packingDrafts[activeInvoice.batch_invoice_id];
    if (!draft) {
      return;
    }
    setSubmittingPacking(true);
    try {
      await patchBackend(`/delivery-workflow/batch-invoices/${activeInvoice.batch_invoice_id}/packing-output`, {
        total_boxes_or_bags: toNumber(draft.total_boxes_or_bags),
        loose_cases: toNumber(draft.loose_cases),
        full_cases: toNumber(draft.full_cases),
        packing_note: draft.packing_note || null,
      });
      if (!options?.silent) {
        toast.success("Packing output saved.");
      }
      if (options?.reload ?? true) {
        await loadData();
      }
    } catch (error) {
      if (!options?.silent) {
        toast.error(error instanceof Error ? error.message : "Failed to save packing output");
      }
      throw error;
    }
  }

  async function savePacking() {
    if (!activeInvoice) {
      return;
    }
    setSubmittingPacking(true);
    try {
      await persistPacking();
    } finally {
      setSubmittingPacking(false);
    }
  }

  async function moveReady() {
    if (!activeInvoice) {
      return;
    }
    setSubmittingPacking(true);
    try {
      await persistPacking({ silent: true, reload: false });
      await postBackend(`/delivery-workflow/batch-invoices/${activeInvoice.batch_invoice_id}/ready-for-dispatch`, {});
      toast.success("Invoice moved to ready-to-dispatch.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to move invoice to dispatch");
    } finally {
      setSubmittingPacking(false);
    }
  }

  async function markLoaded() {
    if (!activeStop) {
      return;
    }
    setRunActionBusy(true);
    try {
      await postBackend(`/delivery-workflow/delivery-runs/stops/${activeStop.stop_id}/mark-loaded`, {});
      toast.success("Invoice marked loaded.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to mark loaded");
    } finally {
      setRunActionBusy(false);
    }
  }

  async function startRun() {
    if (!activeRun) {
      return;
    }
    setRunActionBusy(true);
    try {
      await postBackend(`/delivery-workflow/delivery-runs/${activeRun.run_id}/start`, {});
      toast.success("Delivery started.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start delivery");
    } finally {
      setRunActionBusy(false);
    }
  }

  async function completeStop(action: "deliver" | "not-delivered") {
    if (!activeStop) {
      return;
    }
    const failureReason =
      action === "not-delivered" ? window.prompt("Reason for not delivered", "OUTLET_CLOSED")?.trim() || "" : undefined;
    if (action === "not-delivered" && !failureReason) {
      toast.error("Reason is required.");
      return;
    }
    setRunActionBusy(true);
    try {
      await postBackend(`/delivery-workflow/delivery-runs/stops/${activeStop.stop_id}/${action}`, {
        failure_reason: failureReason,
      });
      toast.success(action === "deliver" ? "Invoice delivered." : "Invoice returned to ready-to-dispatch.");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action} stop`);
    } finally {
      setRunActionBusy(false);
    }
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

  const totalInvoices = batches.reduce((sum, batch) => sum + batch.invoice_count, 0);
  const totalWeight = batches.reduce(
    (sum, batch) => sum + batch.invoices.reduce((invoiceSum, invoice) => invoiceSum + invoice.total_weight_grams, 0),
    0
  );
  const isSupervisor = me?.employee_role === "SUPERVISOR";
  const shellTitle = me?.full_name || "Employee User";
  const activeNavKey =
    mode === "delivery" ? "dispatch" : pathname === "/verification" ? "verification" : "tasks";

  if (mode === "delivery") {
    const runCount = runs.length;
    const stopCount = runs.reduce((sum, run) => sum + run.stops.length, 0);
    const runWeight = runs.reduce((sum, run) => sum + run.total_weight_grams, 0);
    const deliveryRoleLabel =
      me?.employee_role === "SUPERVISOR"
        ? "Supervisor Loading"
        : me?.employee_role === "DRIVER"
          ? "Driver Route"
          : me?.employee_role === "BILL_MANAGER"
            ? "Bill Manager"
            : "Delivery Crew";

    return (
      <AppShell role="employee" activeKey={activeNavKey} userName={shellTitle}>
        <div className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{deliveryRoleLabel}</h2>
            <p className="text-sm text-muted-foreground">
              {isSupervisor
                ? "Load invoices into the vehicle in reverse route order and confirm readiness."
                : me?.employee_role === "DRIVER"
                  ? "Review the optimized route and start delivery only when all loaded invoices have document numbers."
                  : me?.employee_role === "BILL_MANAGER"
                    ? "Complete outlet handover invoice by invoice and return failed deliveries to the queue."
                    : "View your assigned vehicle task and overall run status for the day."}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Runs</p><p className="mt-2 text-3xl font-semibold">{loading ? "-" : runCount}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Invoices</p><p className="mt-2 text-3xl font-semibold">{loading ? "-" : stopCount}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Weight</p><p className="mt-2 text-3xl font-semibold">{loading ? "-" : formatWeight(runWeight)}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Role</p><p className="mt-2 text-xl font-semibold">{me?.employee_role || "-"}</p></CardContent></Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
            <Card>
              <CardHeader><CardTitle>Assigned Runs</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
                ) : runs.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No delivery runs assigned.</div>
                ) : (
                  runs.map((run) => (
                    <button
                      key={run.run_id}
                      type="button"
                      onClick={() => setActiveRunId(run.run_id)}
                      className={`w-full rounded-xl border p-4 text-left transition ${activeRun?.run_id === run.run_id ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900/50" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{run.vehicle_name || run.registration_no || "Vehicle Run"}</p>
                          <p className="text-xs text-muted-foreground">{run.warehouse_name}</p>
                        </div>
                        <span className="rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide">{run.status.replaceAll("_", " ")}</span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                        <span>{run.stops.length} invoices</span>
                        <span>{run.delivery_date}</span>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <div className="space-y-4">
              {!activeRun ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">Select a run to inspect it.</CardContent></Card>
              ) : (
                <>
                  <Card>
                    <CardHeader><CardTitle>{activeRun.vehicle_name || "Vehicle Run"} · {activeRun.warehouse_name}</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Date</p><p className="mt-1 font-medium">{activeRun.delivery_date}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Driver</p><p className="mt-1 font-medium">{activeRun.driver_name || "-"}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Bill Manager</p><p className="mt-1 font-medium">{activeRun.bill_manager_name || "-"}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Loader</p><p className="mt-1 font-medium">{activeRun.loader_name || "-"}</p></div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Route Provider</p><p className="mt-1 font-medium">{activeRun.route_provider || "-"}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Estimated Route Time</p><p className="mt-1 font-medium">{formatDuration(activeRun.total_duration_seconds)}</p></div>
                        <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Optimization</p><p className="mt-1 font-medium">{activeRun.optimized ? "Optimized" : "Manual"}</p></div>
                      </div>

                      <div className="overflow-hidden rounded-lg border">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                              <TableHead>Invoice</TableHead>
                              <TableHead>Customer</TableHead>
                              <TableHead>{isSupervisor ? "Load Seq" : "Route Seq"}</TableHead>
                              <TableHead>Distance</TableHead>
                              <TableHead>Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {activeRun.stops.map((stop, index) => (
                              <TableRow
                                key={stop.stop_id}
                                className={`${index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""} ${activeStop?.stop_id === stop.stop_id ? "ring-1 ring-zinc-900 dark:ring-zinc-100" : ""}`}
                                onClick={() => setActiveStopId(stop.stop_id)}
                              >
                                <TableCell className="cursor-pointer font-medium">{stop.invoice_number}</TableCell>
                                <TableCell>{stop.customer_name}</TableCell>
                                <TableCell>{isSupervisor ? (stop.loading_sequence_no ?? "-") : (stop.sequence_no ?? "-")}</TableCell>
                                <TableCell>{formatMeters(stop.distance_meters)}</TableCell>
                                <TableCell>{stop.status}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {me?.employee_role === "DRIVER" ? (
                        <div className="flex flex-wrap justify-end gap-3">
                          {activeRun.google_maps_url ? (
                            <Button asChild variant="outline">
                              <a href={activeRun.google_maps_url} target="_blank" rel="noreferrer">
                                Open Route Map
                              </a>
                            </Button>
                          ) : null}
                          <Button onClick={() => void startRun()} disabled={runActionBusy || activeRun.status !== "READY_TO_START"}>
                            {runActionBusy ? "Starting..." : "Start Delivery"}
                          </Button>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  {activeStop ? (
                    <Card>
                      <CardHeader><CardTitle>{activeStop.invoice_number} · {activeStop.customer_name}</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Stop Status</p><p className="mt-1 font-medium">{activeStop.status}</p></div>
                          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Weight</p><p className="mt-1 font-medium">{formatWeight(activeStop.total_weight_grams)}</p></div>
                          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">E-Invoice</p><p className="mt-1 font-medium">{activeStop.e_invoice_number || "-"}</p></div>
                          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">E-Way Bill</p><p className="mt-1 font-medium">{activeStop.eway_bill_number || "-"}</p></div>
                        </div>

                        {me?.employee_role === "SUPERVISOR" || me?.employee_role === "BILL_MANAGER" || me?.employee_role === "DRIVER" ? (
                          <div className="overflow-hidden rounded-lg border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                                  <TableHead>SKU</TableHead>
                                  <TableHead>Product</TableHead>
                                  <TableHead>Qty</TableHead>
                                  <TableHead>Actual</TableHead>
                                  <TableHead>MRP</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {activeStop.items.map((item, index) => (
                                  <TableRow key={item.sales_final_invoice_item_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                                    <TableCell>{item.sku}</TableCell>
                                    <TableCell>{item.product_name}</TableCell>
                                    <TableCell>{item.quantity}</TableCell>
                                    <TableCell>{item.actual_quantity}</TableCell>
                                    <TableCell>{formatPrice(item.mrp)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        ) : (
                          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                            Task only view. Invoice details are intentionally hidden for your role.
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3">
                          {me?.employee_role === "SUPERVISOR" ? (
                            <Button onClick={() => void markLoaded()} disabled={runActionBusy || activeStop.status === "LOADED"}>
                              {runActionBusy ? "Updating..." : "Mark Loaded"}
                            </Button>
                          ) : null}
                          {me?.employee_role === "BILL_MANAGER" ? (
                            <>
                              <Button onClick={() => void completeStop("deliver")} disabled={runActionBusy}>Mark Delivered</Button>
                              <Button variant="outline" onClick={() => void completeStop("not-delivered")} disabled={runActionBusy}>Not Delivered</Button>
                            </>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell role="employee" activeKey={activeNavKey} userName={shellTitle}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{isSupervisor ? "Supervisor Verification" : "Packing Workflow"}</h2>
          <p className="text-sm text-muted-foreground">
            {isSupervisor
              ? "Verify invoice shortfalls before the packers start packing."
              : "Review assigned invoices, record actual quantities, and complete packing."}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Batches</p><p className="mt-2 text-3xl font-semibold">{loading ? "-" : batches.length}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Invoices</p><p className="mt-2 text-3xl font-semibold">{loading ? "-" : totalInvoices}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total Weight</p><p className="mt-2 text-3xl font-semibold">{loading ? "-" : formatWeight(totalWeight)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active Role</p><p className="mt-2 text-xl font-semibold">{me?.employee_role || "-"}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
          <Card>
            <CardHeader><CardTitle>Assigned Batches</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
              ) : batches.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No workflow batches available.
                </div>
              ) : (
                batches.map((batch) => (
                  <button
                    key={batch.batch_id}
                    type="button"
                    onClick={() => setActiveBatchId(batch.batch_id)}
                    className={`w-full rounded-xl border p-4 text-left transition ${activeBatch?.batch_id === batch.batch_id ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900/50" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/40"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{batch.batch_code}</p>
                        <p className="text-xs text-muted-foreground">{batch.warehouse_name}</p>
                      </div>
                      <span className="rounded-full border px-2 py-1 text-[11px] uppercase tracking-wide">{batch.status.replaceAll("_", " ")}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                      <span>{batch.invoice_count} invoices</span>
                      <span>{formatDate(batch.created_at)}</span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Invoices In Batch</CardTitle></CardHeader>
              <CardContent>
                {!activeBatch ? (
                  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Select a batch to inspect invoices.</div>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                          <TableHead>Invoice</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Weight</TableHead>
                          <TableHead>{isSupervisor ? "Packer" : "Supervisor"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeBatch.invoices.map((invoice, index) => (
                          <TableRow
                            key={invoice.batch_invoice_id}
                            className={`${index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""} ${activeInvoice?.batch_invoice_id === invoice.batch_invoice_id ? "ring-1 ring-zinc-900 dark:ring-zinc-100" : ""}`}
                            onClick={() => setActiveInvoiceId(invoice.batch_invoice_id)}
                          >
                            <TableCell className="cursor-pointer font-medium">{invoice.invoice_number}</TableCell>
                            <TableCell>{invoice.customer_name}</TableCell>
                            <TableCell>{invoice.status}</TableCell>
                            <TableCell>{formatWeight(invoice.total_weight_grams)}</TableCell>
                            <TableCell>{isSupervisor ? invoice.assigned_packer_name : invoice.assigned_supervisor_name}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {activeInvoice ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    {activeInvoice.invoice_number} · {activeInvoice.customer_name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Warehouse</p><p className="mt-1 font-medium">{activeInvoice.warehouse_name}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total Amount</p><p className="mt-1 font-medium">INR {formatPrice(activeInvoice.total_amount)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Invoice Weight</p><p className="mt-1 font-medium">{formatWeight(activeInvoice.total_weight_grams)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Workflow Status</p><p className="mt-1 font-medium">{activeInvoice.status}</p></div>
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                          <TableHead>SKU</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>MRP</TableHead>
                          <TableHead>Ordered</TableHead>
                          <TableHead>Actual</TableHead>
                          <TableHead>Shortfall</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activeInvoice.items.map((item, index) => {
                          const draft = executionDrafts[item.sales_final_invoice_item_id] ?? {
                            actual_quantity: String(item.actual_quantity || item.quantity),
                            shortfall_reason: item.shortfall_reason || "",
                          };
                          const actual = Math.max(0, Math.min(item.quantity, toNumber(draft.actual_quantity)));
                          const shortfall = Math.max(0, item.quantity - actual);
                          return (
                            <TableRow key={item.sales_final_invoice_item_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                              <TableCell>{item.sku}</TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{item.product_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.case_size ? `1 case = ${item.case_size} pieces` : "Case conversion not set"} | {item.unit}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>{formatPrice(item.mrp)}</TableCell>
                              <TableCell>{item.quantity}</TableCell>
                              <TableCell>
                                {isSupervisor || activeInvoice.status !== "PACKERS_ASSIGNED" ? (
                                  <span>{actual}</span>
                                ) : (
                                  <Input
                                    type="number"
                                    min={0}
                                    max={item.quantity}
                                    value={draft.actual_quantity}
                                    onChange={(e) =>
                                      setExecutionDrafts((prev) => ({
                                        ...prev,
                                        [item.sales_final_invoice_item_id]: {
                                          ...draft,
                                          actual_quantity: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                )}
                              </TableCell>
                              <TableCell>{shortfall}</TableCell>
                              <TableCell>
                                {isSupervisor || activeInvoice.status !== "PACKERS_ASSIGNED" ? (
                                  <span>{draft.shortfall_reason || item.shortfall_reason || "-"}</span>
                                ) : (
                                  <select
                                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={draft.shortfall_reason}
                                    onChange={(e) =>
                                      setExecutionDrafts((prev) => ({
                                        ...prev,
                                        [item.sales_final_invoice_item_id]: {
                                          ...draft,
                                          shortfall_reason: e.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">Select reason</option>
                                    {SHORTFALL_REASONS.map((reason) => (
                                      <option key={reason} value={reason}>{reason.replaceAll("_", " ")}</option>
                                    ))}
                                  </select>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {!isSupervisor && activeInvoice.status === "PACKERS_ASSIGNED" ? (
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => void saveExecution()} disabled={submittingExecution}>Save Quantities</Button>
                      <Button variant="outline" onClick={() => void requestVerification()} disabled={submittingExecution}>Request Verification</Button>
                    </div>
                  ) : null}

                  {!isSupervisor && activeInvoice.status === "PACKING_STARTED" ? (
                    <div className="space-y-4 rounded-xl border p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1"><Label>Total Boxes/Bags</Label><Input type="number" min={0} value={packingDrafts[activeInvoice.batch_invoice_id]?.total_boxes_or_bags ?? "0"} onChange={(e) => setPackingDrafts((prev) => ({ ...prev, [activeInvoice.batch_invoice_id]: { ...(prev[activeInvoice.batch_invoice_id] ?? { total_boxes_or_bags: "0", loose_cases: "0", full_cases: "0", packing_note: "" }), total_boxes_or_bags: e.target.value } }))} /></div>
                        <div className="space-y-1"><Label>Loose Cases</Label><Input type="number" min={0} value={packingDrafts[activeInvoice.batch_invoice_id]?.loose_cases ?? "0"} onChange={(e) => setPackingDrafts((prev) => ({ ...prev, [activeInvoice.batch_invoice_id]: { ...(prev[activeInvoice.batch_invoice_id] ?? { total_boxes_or_bags: "0", loose_cases: "0", full_cases: "0", packing_note: "" }), loose_cases: e.target.value } }))} /></div>
                        <div className="space-y-1"><Label>Full Cases</Label><Input type="number" min={0} value={packingDrafts[activeInvoice.batch_invoice_id]?.full_cases ?? "0"} onChange={(e) => setPackingDrafts((prev) => ({ ...prev, [activeInvoice.batch_invoice_id]: { ...(prev[activeInvoice.batch_invoice_id] ?? { total_boxes_or_bags: "0", loose_cases: "0", full_cases: "0", packing_note: "" }), full_cases: e.target.value } }))} /></div>
                        <div className="space-y-1"><Label>Invoice Date</Label><div className="h-10 rounded-md border px-3 py-2 text-sm text-muted-foreground">{formatDate(activeInvoice.invoice_date)}</div></div>
                      </div>
                      <div className="space-y-1"><Label>Packing Note</Label><Textarea value={packingDrafts[activeInvoice.batch_invoice_id]?.packing_note ?? ""} onChange={(e) => setPackingDrafts((prev) => ({ ...prev, [activeInvoice.batch_invoice_id]: { ...(prev[activeInvoice.batch_invoice_id] ?? { total_boxes_or_bags: "0", loose_cases: "0", full_cases: "0", packing_note: "" }), packing_note: e.target.value } }))} /></div>
                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => void savePacking()} disabled={submittingPacking}>Save Packing Output</Button>
                        <Button variant="outline" onClick={() => void moveReady()} disabled={submittingPacking}>Move To Vehicle Allocation</Button>
                      </div>
                    </div>
                  ) : null}

                  {isSupervisor && activeInvoice.status === "VERIFICATION_PENDING" ? (
                    <div className="flex flex-wrap gap-3">
                      <Button onClick={() => void verifyOrReject("verify")} disabled={decisionBusy}>Verify</Button>
                      <Button variant="outline" onClick={() => void verifyOrReject("reject")} disabled={decisionBusy}>Reject</Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
