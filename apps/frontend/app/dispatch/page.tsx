import { EmployeeRoleGuard } from "@/components/auth/employee-role-guard";
import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { EmployeeDeliveryWorkflow } from "@/components/modules/employee-delivery-workflow";

export default function DispatchPage() {
  return (
    <PortalAuthGate portal="EMPLOYEE">
      <EmployeeRoleGuard allow={["SUPERVISOR", "DELIVERY_EMPLOYEE", "DRIVER", "IN_VEHICLE_HELPER", "BILL_MANAGER", "LOADER"]}>
        <EmployeeDeliveryWorkflow mode="delivery" />
      </EmployeeRoleGuard>
    </PortalAuthGate>
  );
}
