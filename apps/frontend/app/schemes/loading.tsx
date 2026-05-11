import { AdminListRouteSkeleton } from "@/components/layout/admin-list-route-skeleton";

export default function Loading() {
  return (
    <AdminListRouteSkeleton
      activeKey="schemes"
      title="Schemes module"
      columnLabels={["Scheme", "Customer category", "Condition", "Scope", "Reward", "Period", "Status", "Actions"]}
    />
  );
}
