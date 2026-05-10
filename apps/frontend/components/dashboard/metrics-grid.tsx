import {
  CircleDollarSign,
  Clock3,
  ContactRound,
  Package,
  ReceiptText,
  ShoppingCart,
  Truck,
  Users2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardOverview } from "@/components/dashboard/types";
import { cn } from "@/lib/utils";

type MetricCard = {
  key: string;
  title: string;
  value: string;
  delta?: string;
  hint: string;
  icon: LucideIcon;
  tone?: "default" | "muted" | "danger";
};

function toNumber(value: string | number | undefined | null): number {
  if (typeof value === "number") return value;
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

function formatCount(value: string | number | undefined | null): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(toNumber(value));
}

function formatChange(current: string | number | undefined | null, previous: string | number | undefined | null): string | undefined {
  const currentValue = toNumber(current);
  const previousValue = toNumber(previous);
  if (previousValue <= 0) {
    return undefined;
  }
  const pct = (((currentValue - previousValue) / previousValue) * 100).toFixed(1);
  return `${pct}% vs yesterday`;
}

function getMetricCards(data: DashboardOverview, showFinance: boolean): MetricCard[] {
  const trend = data.sales_trend;
  const today = trend.at(-1);
  const yesterday = trend.at(-2);
  const salesDelta = today && yesterday ? formatChange(today.sales_total, yesterday.sales_total) : undefined;
  const purchaseDelta = today && yesterday ? formatChange(today.purchase_total, yesterday.purchase_total) : undefined;

  const cards: MetricCard[] = [
    {
      key: "sales_today",
      title: "Sales Today",
      value: formatCurrency(data.summary.sales_today_total),
      delta: salesDelta,
      hint: "invoiced today",
      icon: CircleDollarSign,
    },
    {
      key: "sales_month",
      title: "Sales MTD",
      value: formatCurrency(data.summary.sales_month_total),
      hint: "month to date",
      icon: ReceiptText,
    },
    {
      key: "purchase_today",
      title: "Purchase Today",
      value: formatCurrency(data.summary.purchase_today_total),
      delta: purchaseDelta,
      hint: "bills entered today",
      icon: ShoppingCart,
    },
    {
      key: "pending_orders",
      title: "Pending Orders",
      value: formatCount(data.summary.pending_orders),
      hint: "awaiting packing",
      icon: Clock3,
    },
    {
      key: "pending_packing",
      title: "Packing Queue",
      value: formatCount(data.summary.pending_packing),
      hint: "in progress",
      icon: Package,
    },
    {
      key: "ready_to_dispatch",
      title: "Ready to Dispatch",
      value: formatCount(data.summary.ready_to_dispatch),
      hint: "dispatch ready",
      icon: Truck,
    },
    {
      key: "low_stock_alerts",
      title: "Stock Alerts",
      value: formatCount(data.summary.low_stock_alerts),
      hint: "reorder focus",
      icon: Warehouse,
    },
  ];

  if (showFinance) {
    cards.push({
      key: "receivables",
      title: "Receivables",
      value: formatCurrency(data.summary.receivables_total),
      hint: "customer ledger",
      icon: ContactRound,
    });
  }

  cards.push(
    {
      key: "active_customers",
      title: "Customers",
      value: formatCount(data.summary.active_customers),
      hint: "active records",
      icon: Users2,
    },
    {
      key: "active_vendors",
      title: "Vendors",
      value: formatCount(data.summary.active_vendors),
      hint: "active records",
      icon: ContactRound,
    },
    {
      key: "warehouses",
      title: "Warehouses",
      value: formatCount(data.summary.warehouses),
      hint: "active locations",
      icon: Warehouse,
    }
  );

  return cards;
}

type MetricsGridProps = {
  data: DashboardOverview;
  showFinance: boolean;
};

export function MetricsGrid({ data, showFinance }: MetricsGridProps) {
  const metricCards = getMetricCards(data, showFinance);

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {metricCards.map((card) => (
        <Card key={card.key} className={cn(card.tone === "danger" && "border-destructive/40")}>
          <CardHeader>
            <CardDescription>{card.title}</CardDescription>
            <CardTitle className="text-2xl">{card.value}</CardTitle>
            <CardAction>
              <card.icon className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">
            {card.delta ? <span className="font-medium text-foreground">{card.delta}</span> : null}
            <span className={card.delta ? "ml-1" : "font-medium text-foreground"}>{card.hint}</span>
          </CardFooter>
        </Card>
      ))}
    </section>
  );
}
