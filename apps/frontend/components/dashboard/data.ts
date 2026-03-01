import { CircleDollarSign, Clock3, Package, Truck, type LucideIcon } from "lucide-react";

export type MetricCard = {
  title: string;
  value: string;
  delta: string;
  hint: string;
  icon: LucideIcon;
};

export const metricCards: MetricCard[] = [
  {
    title: "Today's Orders",
    value: "184",
    delta: "+12.4%",
    hint: "vs. yesterday",
    icon: Package,
  },
  {
    title: "Pending Packing",
    value: "37",
    delta: "-6.1%",
    hint: "queue reduced",
    icon: Clock3,
  },
  {
    title: "Ready For Dispatch",
    value: "29",
    delta: "+4 routes",
    hint: "next 2 hours",
    icon: Truck,
  },
  {
    title: "Receivables Today",
    value: "INR 3.8L",
    delta: "+INR 42K",
    hint: "expected collection",
    icon: CircleDollarSign,
  },
];

export const dispatchQueue = [
  { invoice: "INV-240198", customer: "Sri Lakshmi Traders", route: "North-12", amount: "INR 14,250", status: "Ready" },
  { invoice: "INV-240199", customer: "Annapurna Mart", route: "North-12", amount: "INR 8,790", status: "Packing" },
  { invoice: "INV-240200", customer: "Green Leaf Stores", route: "East-04", amount: "INR 11,180", status: "Ready" },
  { invoice: "INV-240201", customer: "Mohan Wholesale", route: "South-03", amount: "INR 22,640", status: "Awaiting Stock" },
];

export const lowStock = [
  { sku: "SKU-ATTA-10KG", product: "Aashirvaad Atta 10kg", stock: "18", reorder: "120", warehouse: "Main WH" },
  { sku: "SKU-OIL-1L", product: "Sunflower Oil 1L", stock: "42", reorder: "200", warehouse: "Main WH" },
  { sku: "SKU-SALT-1KG", product: "Iodized Salt 1kg", stock: "25", reorder: "150", warehouse: "South WH" },
];
