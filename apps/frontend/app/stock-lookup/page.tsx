import { EmployeeRoleGuard } from "@/components/auth/employee-role-guard";
import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import EmployeeStockPage from "@/app/employee/stock/page";

export default function StockLookupPage() {
  return (
    <PortalAuthGate portal="EMPLOYEE">
      <EmployeeRoleGuard allow={["SALESMAN"]}>
        <EmployeeStockPage />
      </EmployeeRoleGuard>
    </PortalAuthGate>
  );
}
