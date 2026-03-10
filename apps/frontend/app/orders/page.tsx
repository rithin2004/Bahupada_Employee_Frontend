import { EmployeeRoleGuard } from "@/components/auth/employee-role-guard";
import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import EmployeeOrdersPage from "@/app/employee/orders/page";

export default function OrdersPage() {
  return (
    <PortalAuthGate portal="EMPLOYEE">
      <EmployeeRoleGuard allow={["SALESMAN"]}>
        <EmployeeOrdersPage />
      </EmployeeRoleGuard>
    </PortalAuthGate>
  );
}
