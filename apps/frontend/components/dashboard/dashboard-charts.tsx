import { format } from "date-fns";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardStatusPoint,
  DashboardTrendPoint,
  DashboardWarehouseStockPoint,
} from "@/components/dashboard/types";

function toNumber(value: string | number | undefined | null): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: string | number | undefined | null): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function buildPolyline(series: number[], width: number, height: number, padX: number, padY: number): string {
  const max = Math.max(...series, 1);
  const usableWidth = width - padX * 2;
  const usableHeight = height - padY * 2;
  const step = series.length > 1 ? usableWidth / (series.length - 1) : usableWidth;
  return series
    .map((value, index) => {
      const x = padX + step * index;
      const y = padY + usableHeight - (value / max) * usableHeight;
      return `${x},${y}`;
    })
    .join(" ");
}

function LineChartCard({ points }: { points: DashboardTrendPoint[] }) {
  const width = 720;
  const height = 260;
  const padX = 52;
  const padY = 24;
  const sales = points.map((item) => toNumber(item.sales_total));
  const purchases = points.map((item) => toNumber(item.purchase_total));
  const salesLine = buildPolyline(sales, width, height, padX, padY);
  const purchaseLine = buildPolyline(purchases, width, height, padX, padY);
  const labels = points.map((item) => format(new Date(item.day), "dd MMM"));
  const maxValue = Math.max(...sales, ...purchases, 1);

  return (
    <Card className="w-full min-w-0 xl:col-span-2">
      <CardHeader>
        <CardTitle>Sales and Purchase Trend</CardTitle>
        <CardDescription>Last 7 days of live activity.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-chart-1" />
            Sales {formatCurrency(sales.at(-1))}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-chart-2" />
            Purchase {formatCurrency(purchases.at(-1))}
          </span>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <svg viewBox={`0 0 ${width} ${height}`} className="block h-64 w-full" role="img" aria-label="Sales and purchase trend chart">
            {Array.from({ length: 4 }, (_, index) => {
              const y = padY + ((height - padY * 2) / 3) * index;
              return <line key={index} x1={padX} x2={width - padX} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" />;
            })}
            <polyline points={salesLine} fill="none" stroke="var(--color-chart-1)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={purchaseLine} fill="none" stroke="var(--color-chart-2)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <polyline
              points={`${padX},${height - padY} ${salesLine} ${width - padX},${height - padY}`}
              fill="var(--color-chart-1)"
              fillOpacity="0.08"
              stroke="none"
            />
            {sales.map((value, index) => {
              const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : width - padX * 2;
              const x = padX + step * index;
              const y = padY + (height - padY * 2) - (value / maxValue) * (height - padY * 2);
              return (
                <circle key={`sales-${index}`} cx={x} cy={y} r="4" fill="var(--color-chart-1)" />
              );
            })}
            {purchases.map((value, index) => {
              const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : width - padX * 2;
              const x = padX + step * index;
              const y = padY + (height - padY * 2) - (value / maxValue) * (height - padY * 2);
              return (
                <circle key={`purchase-${index}`} cx={x} cy={y} r="4" fill="var(--color-chart-2)" />
              );
            })}
            {labels.map((label, index) => {
              const step = points.length > 1 ? (width - padX * 2) / (points.length - 1) : width - padX * 2;
              const x = padX + step * index;
              return (
                <text
                  key={label}
                  x={x}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {label}
                </text>
              );
            })}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChartCard({
  title,
  description,
  points,
}: {
  title: string;
  description: string;
  points: DashboardStatusPoint[] | DashboardWarehouseStockPoint[];
}) {
  const max = Math.max(
    ...points.map((point) => ("count" in point ? point.count : toNumber(point.total_stock))),
    1
  );

  return (
    <Card className="w-full min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {points.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No live data yet.</div>
        ) : null}
        {points.map((point) => {
          const value = "count" in point ? point.count : toNumber(point.total_stock);
          const label = "count" in point ? point.label : point.warehouse_name;
          const detail = "count" in point ? `${point.count}` : `${formatCompact(value)} units`;
          return (
            <div key={label} className="space-y-2">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{label}</span>
                <span className="text-muted-foreground">{detail}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-chart-4"
                  style={{ width: `${(value / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function DashboardCharts({
  salesTrend,
  packingStatus,
  warehouseStock,
}: {
  salesTrend: DashboardTrendPoint[];
  packingStatus: DashboardStatusPoint[];
  warehouseStock: DashboardWarehouseStockPoint[];
}) {
  return (
    <section className="grid w-full min-w-0 gap-4 xl:grid-cols-3">
      <LineChartCard points={salesTrend} />
      <BarChartCard
        title="Packing Workflow"
        description="Current task mix across the packing pipeline."
        points={packingStatus}
      />
      <BarChartCard
        title="Warehouse Stock"
        description="Available stock grouped by warehouse."
        points={warehouseStock}
      />
    </section>
  );
}
