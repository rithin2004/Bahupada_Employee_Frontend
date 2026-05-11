import { AdminListRouteSkeleton } from "@/components/layout/admin-list-route-skeleton";

export default function Loading() {
  return (
    <AdminListRouteSkeleton
      activeKey="purchase"
      tabCount={2}
      title="Purchase module"
      columnLabels={["Reference", "Vendor", "Warehouse", "Items", "Status", "Action"]}
    />
  );
}
