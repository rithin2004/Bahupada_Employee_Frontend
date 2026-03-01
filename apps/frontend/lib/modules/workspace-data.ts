import type { AppRole } from "@/lib/navigation";
import { asArray, asObject, fetchBackend } from "@/lib/backend-api";

export type ModuleStatus = "Ready" | "Pending" | "Blocked";

export type ModuleMetric = {
  label: string;
  value: string;
  change: string;
};

export type ModuleTask = {
  item: string;
  owner: string;
  status: ModuleStatus;
  eta: string;
};

export type ModuleWorkspaceData = {
  title: string;
  subtitle: string;
  metrics: ModuleMetric[];
  tasks: ModuleTask[];
};

export type ModuleFilters = {
  period: "today" | "week" | "month";
  status: "all" | "ready" | "pending" | "blocked";
};

const defaultFilters: ModuleFilters = {
  period: "today",
  status: "all",
};

function countLabel(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function valueFromCount(count: number) {
  return count.toLocaleString("en-US");
}

function parseModuleFilters(params?: Record<string, string | string[] | undefined>): ModuleFilters {
  const period = params?.period;
  const status = params?.status;

  const resolvedPeriod = period === "week" || period === "month" || period === "today" ? period : defaultFilters.period;
  const resolvedStatus =
    status === "ready" || status === "pending" || status === "blocked" || status === "all" ? status : defaultFilters.status;

  return {
    period: resolvedPeriod,
    status: resolvedStatus,
  };
}

function taskMatchesFilter(task: ModuleTask, filters: ModuleFilters) {
  if (filters.status === "all") {
    return true;
  }

  return task.status.toLowerCase() === filters.status;
}

const fallbackModuleDataByKey: Record<string, ModuleWorkspaceData> = {
  masters: {
    title: "Master Data",
    subtitle: "Maintain product, customer, and vendor records with strict data consistency.",
    metrics: [
      { label: "Active SKUs", value: "1,284", change: "+18 this week" },
      { label: "Vendor Profiles", value: "142", change: "3 pending approvals" },
      { label: "Customer Accounts", value: "806", change: "+11 this month" },
    ],
    tasks: [
      { item: "New vendor onboarding", owner: "Arun", status: "Pending", eta: "Today" },
      { item: "SKU code cleanup", owner: "Priya", status: "Ready", eta: "Tomorrow" },
      { item: "Customer GST mismatch", owner: "Finance Ops", status: "Blocked", eta: "Needs review" },
    ],
  },
  procurement: {
    title: "Procurement Operations",
    subtitle: "Track purchase requests, vendor confirmations, and inward schedules.",
    metrics: [
      { label: "Open Purchase Orders", value: "57", change: "12 require follow-up" },
      { label: "Expected Inward Value", value: "$84.3K", change: "+6.2% vs last week" },
      { label: "On-Time Vendor Rate", value: "92%", change: "+1.4% this month" },
    ],
    tasks: [
      { item: "PO-4921 vendor confirmation", owner: "Sourcing", status: "Pending", eta: "2 hrs" },
      { item: "Raw material inward slotting", owner: "Warehouse", status: "Ready", eta: "Today" },
      { item: "Price revision approval", owner: "Management", status: "Blocked", eta: "Awaiting sign-off" },
    ],
  },
  sales: {
    title: "Sales Pipeline",
    subtitle: "Monitor order intake, dispatch commitments, and customer SLAs.",
    metrics: [
      { label: "Orders Today", value: "126", change: "+9% vs yesterday" },
      { label: "Revenue Booked", value: "$41.8K", change: "MTD +12.5%" },
      { label: "SLA Risk Orders", value: "8", change: "Needs immediate action" },
    ],
    tasks: [
      { item: "Priority distributor order", owner: "Sales Desk", status: "Ready", eta: "Today" },
      { item: "Credit hold release", owner: "Accounts", status: "Pending", eta: "4 hrs" },
      { item: "Route mismatch for zone C", owner: "Logistics", status: "Blocked", eta: "Replan required" },
    ],
  },
  orders: {
    title: "My Orders",
    subtitle: "Employee order queue with ownership, due times, and escalation status.",
    metrics: [
      { label: "Assigned Orders", value: "23", change: "5 high priority" },
      { label: "Completed Today", value: "14", change: "+3 vs yesterday" },
      { label: "Overdue", value: "2", change: "Escalate before EOD" },
    ],
    tasks: [
      { item: "Retail chain replenishment", owner: "You", status: "Ready", eta: "1 hr" },
      { item: "Bulk invoice confirmation", owner: "You", status: "Pending", eta: "3 hrs" },
      { item: "Address mismatch correction", owner: "Customer Desk", status: "Blocked", eta: "External response" },
    ],
  },
  stock: {
    title: "Stock Control",
    subtitle: "Watch inventory movement, replenishment triggers, and stock health.",
    metrics: [
      { label: "Total On-Hand Units", value: "38,420", change: "-2.4% this week" },
      { label: "Low Stock SKUs", value: "27", change: "7 critical items" },
      { label: "Inventory Accuracy", value: "98.7%", change: "+0.5% after cycle count" },
    ],
    tasks: [
      { item: "Cycle count zone B", owner: "Warehouse", status: "Ready", eta: "Today" },
      { item: "Reorder PO for carton set", owner: "Procurement", status: "Pending", eta: "Tomorrow" },
      { item: "Negative stock audit", owner: "Control Tower", status: "Blocked", eta: "Data sync pending" },
    ],
  },
  packing: {
    title: "Packing Desk",
    subtitle: "Coordinate pick lists, packaging compliance, and handoff readiness.",
    metrics: [
      { label: "Open Pick Lists", value: "34", change: "11 ready to start" },
      { label: "Packed Today", value: "79", change: "+14 vs yesterday" },
      { label: "QC Exceptions", value: "3", change: "Under review" },
    ],
    tasks: [
      { item: "Fragile order packaging", owner: "Packing Team A", status: "Ready", eta: "Now" },
      { item: "Label reprint batch", owner: "Floor Supervisor", status: "Pending", eta: "45 mins" },
      { item: "Tape stock shortage", owner: "Storekeeper", status: "Blocked", eta: "Restock in progress" },
    ],
  },
  delivery: {
    title: "Delivery Control",
    subtitle: "Track route execution, run sheets, and proof-of-delivery status.",
    metrics: [
      { label: "Runs Scheduled", value: "18", change: "2 delayed departures" },
      { label: "Delivered Today", value: "96", change: "93% first-attempt" },
      { label: "POD Pending", value: "7", change: "Collect before close" },
    ],
    tasks: [
      { item: "Route R-14 departure", owner: "Dispatch", status: "Ready", eta: "15 mins" },
      { item: "Failed delivery callback", owner: "Customer Desk", status: "Pending", eta: "Today" },
      { item: "Vehicle breakdown reroute", owner: "Transport Lead", status: "Blocked", eta: "Awaiting backup van" },
    ],
  },
  planning: {
    title: "Planning Board",
    subtitle: "Balance demand, capacity, and daily workforce scheduling.",
    metrics: [
      { label: "Plan Adherence", value: "94%", change: "+2% this week" },
      { label: "Capacity Utilization", value: "87%", change: "3 lines near max" },
      { label: "Shift Gaps", value: "4", change: "Fill before tomorrow" },
    ],
    tasks: [
      { item: "Morning line rebalance", owner: "Planner", status: "Ready", eta: "Now" },
      { item: "Weekend duty roster", owner: "HR Ops", status: "Pending", eta: "Today" },
      { item: "Demand spike adjustment", owner: "Sales Planning", status: "Blocked", eta: "Waiting forecast revision" },
    ],
  },
  finance: {
    title: "Finance Desk",
    subtitle: "Review collections, payables, and operational cost movements.",
    metrics: [
      { label: "Collections Today", value: "$29.6K", change: "74% of target" },
      { label: "Payables Due", value: "$11.2K", change: "5 invoices due tomorrow" },
      { label: "Gross Margin", value: "24.1%", change: "+0.8% MTD" },
    ],
    tasks: [
      { item: "High-value payment release", owner: "Accounts", status: "Ready", eta: "Today" },
      { item: "Bank reconciliation", owner: "Finance Analyst", status: "Pending", eta: "EOD" },
      { item: "Credit note dispute", owner: "Billing", status: "Blocked", eta: "Needs approval" },
    ],
  },
  hr: {
    title: "HR & Payroll",
    subtitle: "Manage attendance variance, payroll readiness, and staffing updates.",
    metrics: [
      { label: "Attendance Today", value: "96.2%", change: "7 exceptions" },
      { label: "Payroll Readiness", value: "82%", change: "Cutoff in 3 days" },
      { label: "Open Positions", value: "9", change: "2 priority roles" },
    ],
    tasks: [
      { item: "Shift attendance correction", owner: "HR Ops", status: "Ready", eta: "Today" },
      { item: "New joiner documentation", owner: "People Team", status: "Pending", eta: "Tomorrow" },
      { item: "Overtime approval conflict", owner: "Plant Head", status: "Blocked", eta: "Escalated" },
    ],
  },
  rbac: {
    title: "Roles & Permissions",
    subtitle: "Control role access, approval boundaries, and audit-ready permission changes.",
    metrics: [
      { label: "Active Roles", value: "18", change: "2 under review" },
      { label: "Pending Access Requests", value: "13", change: "5 high priority" },
      { label: "Policy Compliance", value: "99.1%", change: "1 anomaly flagged" },
    ],
    tasks: [
      { item: "Approve finance role update", owner: "Security Admin", status: "Ready", eta: "Now" },
      { item: "Remove inactive users", owner: "IT Ops", status: "Pending", eta: "Today" },
      { item: "Conflict in approval matrix", owner: "Audit Team", status: "Blocked", eta: "Needs policy decision" },
    ],
  },
};

async function buildMastersData(): Promise<ModuleWorkspaceData> {
  const [productsRes, customersRes, warehousesRes] = await Promise.all([
    fetchBackend("/masters/products?page=1&page_size=5"),
    fetchBackend("/masters/customers?page=1&page_size=5"),
    fetchBackend("/masters/warehouses?page=1&page_size=5"),
  ]);

  const productItems = asArray(asObject(productsRes).items);
  const customerItems = asArray(asObject(customersRes).items);

  return {
    title: "Master Data",
    subtitle: "Live records from masters endpoints for products, customers, and warehouses.",
    metrics: [
      { label: "Active SKUs", value: valueFromCount(Number(asObject(productsRes).total ?? 0)), change: "From product master" },
      { label: "Customer Accounts", value: valueFromCount(Number(asObject(customersRes).total ?? 0)), change: "From customer master" },
      {
        label: "Warehouses",
        value: valueFromCount(Number(asObject(warehousesRes).total ?? 0)),
        change: "From warehouse master",
      },
    ],
    tasks: [
      ...productItems.slice(0, 2).map((row, idx) => ({
        item: String(row.name ?? row.display_name ?? row.sku ?? `Product ${idx + 1}`),
        owner: "Masters Team",
        status: "Ready" as const,
        eta: "Catalog",
      })),
      ...customerItems.slice(0, 1).map((row, idx) => ({
        item: String(row.name ?? row.outlet_name ?? `Customer ${idx + 1}`),
        owner: "Customer Desk",
        status: "Pending" as const,
        eta: "KYC check",
      })),
    ],
  };
}

async function buildProcurementData(): Promise<ModuleWorkspaceData> {
  const [reorderRes, transferRes, returnsRes] = await Promise.all([
    fetchBackend("/procurement/reorder-logs"),
    fetchBackend("/procurement/warehouse-transfers"),
    fetchBackend("/procurement/purchase-returns"),
  ]);

  const reorderItems = asArray(reorderRes);
  const transferItems = asArray(transferRes);
  const returnItems = asArray(returnsRes);

  return {
    title: "Procurement Operations",
    subtitle: "Live procurement data from reorder logs, warehouse transfers, and purchase returns.",
    metrics: [
      { label: "Reorder Logs", value: valueFromCount(reorderItems.length), change: countLabel(reorderItems.length, "entry", "entries") },
      {
        label: "Warehouse Transfers",
        value: valueFromCount(transferItems.length),
        change: countLabel(transferItems.length, "transfer", "transfers"),
      },
      { label: "Purchase Returns", value: valueFromCount(returnItems.length), change: countLabel(returnItems.length, "return", "returns") },
    ],
    tasks: reorderItems.slice(0, 3).map((row, idx) => ({
      item: String(row.brand ?? row.strategy ?? `Reorder log ${idx + 1}`),
      owner: "Sourcing",
      status: "Pending",
      eta: `${Number(row.days ?? 0)} day window`,
    })),
  };
}

async function buildSalesLikeData(title: string, subtitle: string, owner: string): Promise<ModuleWorkspaceData> {
  const pendingRes = await fetchBackend("/sales/dashboard/pending-orders?limit=50");
  const pending = asObject(pendingRes);
  const items = asArray(pending.items);

  return {
    title,
    subtitle,
    metrics: [
      { label: "Pending Orders", value: valueFromCount(Number(pending.count ?? items.length)), change: "Live sales dashboard" },
      {
        label: "Unique Customers",
        value: valueFromCount(new Set(items.map((item) => String(item.customer_id ?? ""))).size),
        change: "From pending queue",
      },
      { label: "Displayed Rows", value: valueFromCount(items.length), change: "Current API limit" },
    ],
    tasks: items.slice(0, 3).map((item) => ({
      item: String(item.customer_name ?? item.sales_order_id ?? "Pending order"),
      owner,
      status: "Ready",
      eta: "Dispatch pending",
    })),
  };
}

async function buildPackingData(): Promise<ModuleWorkspaceData> {
  const readyRes = await fetchBackend("/packing/dashboard/ready-to-dispatch?limit=50");
  const ready = asObject(readyRes);
  const items = asArray(ready.items);

  return {
    title: "Packing Desk",
    subtitle: "Live ready-to-dispatch queue from packing dashboard.",
    metrics: [
      { label: "Ready To Dispatch", value: valueFromCount(Number(ready.count ?? items.length)), change: "Packing dashboard" },
      {
        label: "Labeled Packs",
        value: valueFromCount(items.filter((item) => Boolean(item.pack_label)).length),
        change: "With pack labels",
      },
      {
        label: "Invoice Marked",
        value: valueFromCount(items.filter((item) => item.invoice_written_on_pack === true).length),
        change: "Invoice written on pack",
      },
    ],
    tasks: items.slice(0, 3).map((item) => ({
      item: String(item.packing_task_id ?? "Packing task"),
      owner: "Packing Team",
      status: "Ready",
      eta: "Ready to handoff",
    })),
  };
}

async function buildDeliveryData(): Promise<ModuleWorkspaceData> {
  const warehouseRes = await fetchBackend("/masters/warehouses?page=1&page_size=1");
  const warehouseItems = asArray(asObject(warehouseRes).items);
  const warehouse = warehouseItems[0];

  if (!warehouse?.id) {
    throw new Error("No warehouse available for delivery dashboard query.");
  }

  const readyRes = await fetchBackend(`/delivery/runs/ready-to-dispatch?warehouse_id=${String(warehouse.id)}`);
  const ready = asObject(readyRes);
  const items = asArray(ready.items);

  return {
    title: "Delivery Control",
    subtitle: "Live delivery readiness data from dispatch APIs.",
    metrics: [
      { label: "Dispatch-Ready Items", value: valueFromCount(Number(ready.count ?? items.length)), change: "Live delivery queue" },
      { label: "Warehouse", value: String(warehouse.name ?? warehouse.code ?? "Selected"), change: "Scoped for API query" },
      { label: "Pack Labels Attached", value: valueFromCount(items.filter((item) => Boolean(item.pack_label)).length), change: "Readiness quality" },
    ],
    tasks: items.slice(0, 3).map((item) => ({
      item: String(item.sales_order_id ?? item.packing_task_id ?? "Dispatch item"),
      owner: "Dispatch",
      status: "Pending",
      eta: "Route planning",
    })),
  };
}

async function buildFinanceData(): Promise<ModuleWorkspaceData> {
  const [trialRes, summaryRes] = await Promise.all([
    fetchBackend("/finance/ledger/trial-balance"),
    fetchBackend("/finance/ledger/summary"),
  ]);

  const trial = asObject(trialRes);
  const summary = asArray(asObject(summaryRes).items);

  return {
    title: "Finance Desk",
    subtitle: "Ledger snapshot from trial balance and account summary endpoints.",
    metrics: [
      { label: "Total Debit", value: String(trial.total_debit ?? "0"), change: "Trial balance" },
      { label: "Total Credit", value: String(trial.total_credit ?? "0"), change: "Trial balance" },
      { label: "Accounts", value: valueFromCount(summary.length), change: "Ledger summary rows" },
    ],
    tasks: summary.slice(0, 3).map((row) => ({
      item: String(row.account_name ?? "Account line"),
      owner: "Finance",
      status: Number(row.net ?? 0) < 0 ? "Blocked" : "Ready",
      eta: `Net ${String(row.net ?? "0")}`,
    })),
  };
}

async function buildHrData(filters: ModuleFilters): Promise<ModuleWorkspaceData> {
  const now = new Date();
  const month = filters.period === "month" ? now.getMonth() + 1 : now.getMonth() + 1;
  const year = now.getFullYear();

  const salaryRes = await fetchBackend(`/payroll/salaries?month=${month}&year=${year}`);
  const salaries = asArray(salaryRes);
  const paid = salaries.filter((row) => String(row.paid_status ?? "").toUpperCase() === "PAID");
  const pending = salaries.length - paid.length;
  const totalNet = salaries.reduce((acc, row) => acc + Number(row.net_salary ?? 0), 0);

  return {
    title: "HR & Payroll",
    subtitle: "Payroll status pulled from salary run entries.",
    metrics: [
      { label: "Salary Records", value: valueFromCount(salaries.length), change: `Month ${month}/${year}` },
      { label: "Paid", value: valueFromCount(paid.length), change: `${pending} pending` },
      { label: "Net Payroll", value: totalNet.toLocaleString("en-US"), change: "From salary entries" },
    ],
    tasks: salaries.slice(0, 3).map((row) => ({
      item: `Salary ${String(row.id ?? "").slice(0, 8)}`,
      owner: "Payroll",
      status: String(row.paid_status ?? "").toUpperCase() === "PAID" ? "Ready" : "Pending",
      eta: String(row.paid_status ?? "UNPAID"),
    })),
  };
}

async function buildStockData(): Promise<ModuleWorkspaceData> {
  const [productsRes, reorderRes] = await Promise.all([
    fetchBackend("/masters/products?page=1&page_size=50"),
    fetchBackend("/procurement/reorder-logs"),
  ]);

  const productPage = asObject(productsRes);
  const products = asArray(productPage.items);
  const reorders = asArray(reorderRes);

  return {
    title: "Stock Control",
    subtitle: "Stock proxy built from products and reorder logs.",
    metrics: [
      { label: "Cataloged Products", value: valueFromCount(Number(productPage.total ?? products.length)), change: "From product master" },
      { label: "Recent Reorder Logs", value: valueFromCount(reorders.length), change: "From procurement logs" },
      { label: "Sampled Items", value: valueFromCount(products.length), change: "Current page" },
    ],
    tasks: products.slice(0, 3).map((row, idx) => ({
      item: String(row.name ?? row.sku ?? `SKU ${idx + 1}`),
      owner: "Inventory",
      status: "Pending",
      eta: "Count verification",
    })),
  };
}

async function getLiveModuleData(moduleKey: string, filters: ModuleFilters): Promise<ModuleWorkspaceData | null> {
  if (moduleKey === "masters") {
    return buildMastersData();
  }

  if (moduleKey === "procurement") {
    return buildProcurementData();
  }

  if (moduleKey === "sales") {
    return buildSalesLikeData("Sales Pipeline", "Pending order queue from live sales dashboard.", "Sales Desk");
  }

  if (moduleKey === "orders") {
    return buildSalesLikeData("My Orders", "Employee order queue from live pending sales orders.", "You");
  }

  if (moduleKey === "packing") {
    return buildPackingData();
  }

  if (moduleKey === "delivery") {
    return buildDeliveryData();
  }

  if (moduleKey === "finance") {
    return buildFinanceData();
  }

  if (moduleKey === "hr") {
    return buildHrData(filters);
  }

  if (moduleKey === "stock") {
    return buildStockData();
  }

  return null;
}

async function getModuleWorkspaceData(
  _role: AppRole,
  moduleKey: string,
  filters: ModuleFilters
): Promise<ModuleWorkspaceData | null> {
  const fallback = fallbackModuleDataByKey[moduleKey];
  if (!fallback) {
    return null;
  }

  const useLiveData = process.env.NEXT_PUBLIC_USE_MODULE_API !== "false";

  if (!useLiveData) {
    return {
      ...fallback,
      tasks: fallback.tasks.filter((task) => taskMatchesFilter(task, filters)),
    };
  }

  try {
    const live = await getLiveModuleData(moduleKey, filters);
    const selected = live ?? fallback;
    return {
      ...selected,
      tasks: selected.tasks.filter((task) => taskMatchesFilter(task, filters)),
    };
  } catch {
    return {
      ...fallback,
      tasks: fallback.tasks.filter((task) => taskMatchesFilter(task, filters)),
    };
  }
}

export { getModuleWorkspaceData, parseModuleFilters };
