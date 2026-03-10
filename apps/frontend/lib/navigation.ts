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
  MapPinned,
  Package,
  Route,
  ReceiptText,
  ShoppingCart,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "admin" | "employee";
export type EmployeeRole =
  | "ADMIN"
  | "PACKER"
  | "SUPERVISOR"
  | "SALESMAN"
  | "DELIVERY_EMPLOYEE"
  | "DRIVER"
  | "IN_VEHICLE_HELPER"
  | "BILL_MANAGER"
  | "LOADER";

export type NavModule = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  employeeRoles?: EmployeeRole[];
};

const adminModules: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "purchase", label: "Purchase Module", href: "/purchase", icon: ShoppingCart },
  { key: "stock", label: "Stock Module", href: "/stock", icon: Package },
  { key: "products", label: "Products", href: "/products?tab=products", icon: Boxes },
  { key: "warehouses", label: "Warehouse Module", href: "/warehouses", icon: Warehouse },
  { key: "sales", label: "Sales Module", href: "/sales", icon: FileText },
  { key: "sales-invoices", label: "Sales Invoices", href: "/sales-invoices", icon: FileText },
  { key: "planning", label: "Planner Module", href: "/planning", icon: CalendarDays },
  { key: "areas", label: "Areas Module", href: "/areas", icon: MapPinned },
  { key: "routes", label: "Routes Module", href: "/routes", icon: Route },
  { key: "vehicles", label: "Vehicles Module", href: "/vehicles", icon: Truck },
  { key: "schemes", label: "Schemes Module", href: "/schemes", icon: BadgePercent },
  { key: "price", label: "Price Module", href: "/price", icon: BadgePercent },
  { key: "credit-debit-notes", label: "Credit Debit Notes", href: "/credit-debit-notes", icon: ReceiptText },
  { key: "customers", label: "Customers Module", href: "/customers", icon: CircleUserRound },
  { key: "employees", label: "Employees Module", href: "/employees", icon: Users2 },
  { key: "vendors", label: "Vendor Module", href: "/vendors", icon: ContactRound },
];

const employeeModules: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { key: "orders", label: "My Orders", href: "/orders", icon: FileText, employeeRoles: ["SALESMAN"] },
  { key: "tasks", label: "Tasks", href: "/tasks", icon: ClipboardList, employeeRoles: ["PACKER"] },
  { key: "verification", label: "Verification", href: "/verification", icon: ClipboardList, employeeRoles: ["SUPERVISOR"] },
  {
    key: "dispatch",
    label: "Dispatch",
    href: "/dispatch",
    icon: Route,
    employeeRoles: ["SUPERVISOR", "DELIVERY_EMPLOYEE", "DRIVER", "IN_VEHICLE_HELPER", "BILL_MANAGER", "LOADER"],
  },
  { key: "stock-lookup", label: "Stock Lookup", href: "/stock-lookup", icon: Package, employeeRoles: ["SALESMAN"] },
  { key: "calendar", label: "Duty Calendar", href: "/calendar", icon: CalendarDays, employeeRoles: ["SALESMAN", "PACKER", "SUPERVISOR", "DELIVERY_EMPLOYEE", "DRIVER", "IN_VEHICLE_HELPER", "BILL_MANAGER", "LOADER"] },
];

export function modulesForRole(role: AppRole, employeeRole?: EmployeeRole | null): NavModule[] {
  if (role === "admin") {
    return adminModules;
  }
  if (!employeeRole) {
    return employeeModules.filter((module) => !module.employeeRoles || module.employeeRoles.length === 0);
  }
  return employeeModules.filter((module) => !module.employeeRoles || module.employeeRoles.includes(employeeRole));
}

export function defaultRouteForAdmin(): string {
  return "/dashboard";
}

export function defaultRouteForEmployee(employeeRole?: EmployeeRole | null): string {
  switch (employeeRole) {
    case "PACKER":
      return "/tasks";
    case "SUPERVISOR":
      return "/verification";
    case "SALESMAN":
      return "/orders";
    case "DELIVERY_EMPLOYEE":
    case "DRIVER":
    case "IN_VEHICLE_HELPER":
    case "BILL_MANAGER":
    case "LOADER":
      return "/dispatch";
    default:
      return "/dashboard";
  }
}
