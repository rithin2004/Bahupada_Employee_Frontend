export type DashboardMetricKey =
  | "sales_today"
  | "sales_month"
  | "purchase_today"
  | "pending_orders"
  | "pending_packing"
  | "ready_to_dispatch"
  | "low_stock_alerts"
  | "active_customers"
  | "active_vendors"
  | "warehouses"
  | "receivables";

export type DashboardSummary = {
  sales_today_total: string | number;
  sales_month_total: string | number;
  purchase_today_total: string | number;
  pending_orders: number;
  pending_packing: number;
  ready_to_dispatch: number;
  low_stock_alerts: number;
  active_customers: number;
  active_vendors: number;
  warehouses: number;
  receivables_total: string | number;
};

export type DashboardTrendPoint = {
  day: string;
  sales_total: string | number;
  purchase_total: string | number;
  invoice_count: number;
};

export type DashboardStatusPoint = {
  label: string;
  count: number;
};

export type DashboardWarehouseStockPoint = {
  warehouse_name: string;
  total_stock: string | number;
  batch_count: number;
};

export type DashboardDispatchItem = {
  sales_order_id: string;
  customer_id: string;
  customer_name: string;
  warehouse_id: string;
  source: string;
  status: string;
  created_at: string;
  invoice_number?: string | null;
  route_name?: string | null;
  warehouse_name?: string | null;
  amount?: string | number;
};

export type DashboardStockAlertItem = {
  product_id: string;
  sku: string;
  product_name: string;
  warehouse_name: string;
  available_quantity: string | number;
  reorder_norm_qty?: string | number | null;
  suggested_qty?: string | number | null;
  final_qty?: string | number | null;
};

export type DashboardOverview = {
  generated_at: string;
  summary: DashboardSummary;
  sales_trend: DashboardTrendPoint[];
  packing_status_breakdown: DashboardStatusPoint[];
  warehouse_stock: DashboardWarehouseStockPoint[];
  dispatch_queue: DashboardDispatchItem[];
  stock_alerts: DashboardStockAlertItem[];
};

