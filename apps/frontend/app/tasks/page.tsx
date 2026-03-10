import { EmployeeRoleGuard } from "@/components/auth/employee-role-guard";
import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { EmployeeDeliveryWorkflow } from "@/components/modules/employee-delivery-workflow";

export default function TasksPage() {
  return (
    <PortalAuthGate portal="EMPLOYEE">
      <EmployeeRoleGuard allow={["PACKER"]}>
        <EmployeeDeliveryWorkflow mode="packing" />
      </EmployeeRoleGuard>
    </PortalAuthGate>
  );
}
