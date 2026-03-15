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
  permissionKey?: string;
  superAdminOnly?: boolean;
  employeeRoles?: EmployeeRole[];
};

const adminModules: NavModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, permissionKey: "dashboard" },
  { key: "purchase", label: "Purchase Module", href: "/purchase", icon: ShoppingCart, permissionKey: "purchase" },
  { key: "stock", label: "Stock Module", href: "/stock", icon: Package, permissionKey: "stock" },
  { key: "products", label: "Products", href: "/products?tab=products", icon: Boxes, permissionKey: "products" },
  { key: "warehouses", label: "Warehouse Module", href: "/warehouses", icon: Warehouse, permissionKey: "warehouses" },
  { key: "sales", label: "Sales Module", href: "/sales", icon: FileText, permissionKey: "sales" },
  { key: "sales-invoices", label: "Sales Invoices", href: "/sales-invoices", icon: FileText, permissionKey: "sales-invoices" },
  { key: "planning", label: "Planner Module", href: "/planning", icon: CalendarDays, permissionKey: "planning" },
  { key: "areas", label: "Areas Module", href: "/areas", icon: MapPinned, permissionKey: "areas" },
  { key: "routes", label: "Routes Module", href: "/routes", icon: Route, permissionKey: "routes" },
  { key: "vehicles", label: "Vehicles Module", href: "/vehicles", icon: Truck, permissionKey: "vehicles" },
  { key: "schemes", label: "Schemes Module", href: "/schemes", icon: BadgePercent, permissionKey: "schemes" },
  { key: "price", label: "Price Module", href: "/price", icon: BadgePercent, permissionKey: "price" },
  { key: "credit-debit-notes", label: "Credit Debit Notes", href: "/credit-debit-notes", icon: ReceiptText, permissionKey: "credit-debit-notes" },
  { key: "customers", label: "Customers Module", href: "/customers", icon: CircleUserRound, permissionKey: "customers" },
  { key: "employees", label: "Employees Module", href: "/employees", icon: Users2, permissionKey: "employees" },
  { key: "vendors", label: "Vendor Module", href: "/vendors", icon: ContactRound, permissionKey: "vendors" },
  { key: "admin-access", label: "Admin Access", href: "/admin-access", icon: Users2, permissionKey: "admin-access", superAdminOnly: true },
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

export function modulesForRole(
  role: AppRole,
  employeeRole?: EmployeeRole | null,
  adminPermissions?: Record<string, { read?: boolean; write?: boolean }>,
  isSuperAdmin = false
): NavModule[] {
  if (role === "admin") {
    if (isSuperAdmin) {
      return adminModules;
    }
    return adminModules.filter((module) => {
      if (module.superAdminOnly) {
        return false;
      }
      if (!module.permissionKey) {
        return true;
      }
      const access = adminPermissions?.[module.permissionKey];
      return Boolean(access?.read || access?.write);
    });
  }
  if (!employeeRole) {
    return employeeModules.filter((module) => !module.employeeRoles || module.employeeRoles.length === 0);
  }
  return employeeModules.filter((module) => !module.employeeRoles || module.employeeRoles.includes(employeeRole));
}

export function defaultRouteForAdmin(
  adminPermissions?: Record<string, { read?: boolean; write?: boolean }>,
  isSuperAdmin = false
): string {
  const visibleModules = modulesForRole("admin", null, adminPermissions, isSuperAdmin);
  return visibleModules[0]?.href ?? "/dashboard";
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
