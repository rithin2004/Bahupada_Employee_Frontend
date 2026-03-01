import {
  BadgePercent,
  Boxes,
  CalendarDays,
  ClipboardList,
  CircleUserRound,
  ContactRound,
  Users2,
  FileText,
  LayoutDashboard,
  Package,
  Route,
  ReceiptText,
  ShoppingCart,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "admin" | "employee";

export type NavModule = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

const adminModules: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { key: "purchase", label: "Purchase Module", href: "/admin/purchase", icon: ShoppingCart },
  { key: "stock", label: "Stock Module", href: "/admin/stock", icon: Package },
  { key: "products", label: "Products", href: "/admin/products?tab=products", icon: Boxes },
  { key: "warehouses", label: "Warehouse Module", href: "/admin/warehouses", icon: Warehouse },
  { key: "sales", label: "Sales Module", href: "/admin/sales", icon: FileText },
  { key: "sales-invoices", label: "Sales Invoices", href: "/admin/sales-invoices", icon: FileText },
  { key: "price", label: "Price Module", href: "/admin/price", icon: BadgePercent },
  { key: "credit-debit-notes", label: "Credit Debit Notes", href: "/admin/credit-debit-notes", icon: ReceiptText },
  { key: "customers", label: "Customers Module", href: "/admin/customers", icon: CircleUserRound },
  { key: "employees", label: "Employees Module", href: "/admin/employees", icon: Users2 },
  { key: "vendors", label: "Vendor Module", href: "/admin/vendors", icon: ContactRound },
];

const employeeModules: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/employee", icon: LayoutDashboard },
  { key: "orders", label: "My Orders", href: "/employee/orders", icon: FileText },
  { key: "packing", label: "Packing Tasks", href: "/employee/packing", icon: ClipboardList },
  { key: "delivery", label: "Delivery Runs", href: "/employee/delivery", icon: Route },
  { key: "stock", label: "Stock Lookup", href: "/employee/stock", icon: Package },
  { key: "planning", label: "Duty Calendar", href: "/employee/planning", icon: CalendarDays },
];

export function modulesForRole(role: AppRole): NavModule[] {
  return role === "admin" ? adminModules : employeeModules;
}
