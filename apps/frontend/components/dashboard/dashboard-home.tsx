"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";

import { DispatchTable } from "@/components/dashboard/dispatch-table";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { LowStockTable } from "@/components/dashboard/low-stock-table";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import type { DashboardOverview } from "@/components/dashboard/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchBackendFresh, asObject } from "@/lib/backend-api";
import type { AppRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type DashboardHomeProps = {
  role: AppRole;
};

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function toNumberValue(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toScalarValue(value: unknown): string | number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return 0;
  }
  return String(value);
}

function normalizeOverview(payload: Record<string, unknown>): DashboardOverview {
  const summary = asObject(payload.summary);
  return {
    generated_at: String(payload.generated_at ?? ""),
    summary: {
      sales_today_total: toScalarValue(summary.sales_today_total),
      sales_month_total: toScalarValue(summary.sales_month_total),
      purchase_today_total: toScalarValue(summary.purchase_today_total),
      pending_orders: toNumberValue(summary.pending_orders),
      pending_packing: toNumberValue(summary.pending_packing),
      ready_to_dispatch: toNumberValue(summary.ready_to_dispatch),
      low_stock_alerts: toNumberValue(summary.low_stock_alerts),
      active_customers: toNumberValue(summary.active_customers),
      active_vendors: toNumberValue(summary.active_vendors),
      warehouses: toNumberValue(summary.warehouses),
      receivables_total: toScalarValue(summary.receivables_total),
    },
    sales_trend: Array.isArray(payload.sales_trend)
      ? payload.sales_trend.map((item) => {
          const row = asObject(item);
          return {
            day: toStringValue(row.day),
            sales_total: toScalarValue(row.sales_total),
            purchase_total: toScalarValue(row.purchase_total),
            invoice_count: toNumberValue(row.invoice_count),
          };
        })
      : [],
    packing_status_breakdown: Array.isArray(payload.packing_status_breakdown)
      ? payload.packing_status_breakdown.map((item) => {
          const row = asObject(item);
          return {
            label: toStringValue(row.label),
            count: toNumberValue(row.count),
          };
        })
      : [],
    warehouse_stock: Array.isArray(payload.warehouse_stock)
        ? payload.warehouse_stock.map((item) => {
          const row = asObject(item);
          return {
            warehouse_name: toStringValue(row.warehouse_name),
            total_stock: toScalarValue(row.total_stock),
            batch_count: toNumberValue(row.batch_count),
          };
        })
      : [],
    dispatch_queue: Array.isArray(payload.dispatch_queue)
      ? payload.dispatch_queue.map((item) => {
          const row = asObject(item);
          return {
            sales_order_id: toStringValue(row.sales_order_id),
            customer_id: toStringValue(row.customer_id),
            customer_name: toStringValue(row.customer_name),
            warehouse_id: toStringValue(row.warehouse_id),
            source: toStringValue(row.source),
            status: toStringValue(row.status),
            created_at: toStringValue(row.created_at),
            invoice_number: row.invoice_number == null ? null : toStringValue(row.invoice_number),
            route_name: row.route_name == null ? null : toStringValue(row.route_name),
            warehouse_name: row.warehouse_name == null ? null : toStringValue(row.warehouse_name),
            amount: toScalarValue(row.amount),
          };
        })
      : [],
    stock_alerts: Array.isArray(payload.stock_alerts)
      ? payload.stock_alerts.map((item) => {
          const row = asObject(item);
          return {
            product_id: toStringValue(row.product_id),
            sku: toStringValue(row.sku),
            product_name: toStringValue(row.product_name),
            warehouse_name: toStringValue(row.warehouse_name),
            available_quantity: toScalarValue(row.available_quantity),
            reorder_norm_qty: row.reorder_norm_qty == null ? null : toScalarValue(row.reorder_norm_qty),
            suggested_qty: row.suggested_qty == null ? null : toScalarValue(row.suggested_qty),
            final_qty: row.final_qty == null ? null : toScalarValue(row.final_qty),
          };
        })
      : [],
  };
}

function formatTimestamp(value: string): string {
  if (!value) {
    return "just now";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "just now";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Card key={index} className="min-h-[320px]">
            <CardHeader>
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="min-h-[360px]">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
        <Card className="min-h-[360px]">
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-72 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function DashboardHome({ role }: DashboardHomeProps) {
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const showFinance = role === "admin";

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = asObject(await fetchBackendFresh("/dashboard/overview"));
      setData(normalizeOverview(payload));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const updatedAt = useMemo(() => formatTimestamp(data?.generated_at ?? ""), [data?.generated_at]);

  if (loading && !data) {
    return <DashboardSkeleton />;
  }

  const dashboard = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            {dashboard ? <Badge variant="outline">Live</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">Updated {updatedAt}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadDashboard()} disabled={loading}>
          <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base">Dashboard data unavailable</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void loadDashboard()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {dashboard ? (
        <>
          <MetricsGrid data={dashboard} showFinance={showFinance} />
          <DashboardCharts
            salesTrend={dashboard.sales_trend}
            packingStatus={dashboard.packing_status_breakdown}
            warehouseStock={dashboard.warehouse_stock}
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <DispatchTable items={dashboard.dispatch_queue} />
            <LowStockTable items={dashboard.stock_alerts} />
          </div>
        </>
      ) : null}
    </div>
  );
}
