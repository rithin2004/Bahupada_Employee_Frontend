import { AdminListRouteSkeleton } from "@/components/layout/admin-list-route-skeleton";

export default function Loading() {
  return (
    <AdminListRouteSkeleton
      activeKey="sales"
      tabCount={2}
      title="Sales module"
      columnLabels={["Reference", "Customer", "Warehouse", "Items", "Status", "Action"]}
    />
  );
}
