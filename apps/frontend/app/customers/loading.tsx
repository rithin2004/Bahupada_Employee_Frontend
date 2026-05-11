import { AdminListRouteSkeleton } from "@/components/layout/admin-list-route-skeleton";

export default function Loading() {
  return (
    <AdminListRouteSkeleton
      activeKey="customers"
      title="Customers module"
      columnLabels={["Name", "Outlet", "City", "Route", "Class", "Phone", "Status", "Actions"]}
    />
  );
}
