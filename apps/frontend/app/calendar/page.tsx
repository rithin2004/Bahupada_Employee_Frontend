import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import EmployeePlanningPage from "@/app/employee/planning/page";

export default function CalendarPage() {
  return (
    <PortalAuthGate portal="EMPLOYEE">
      <EmployeePlanningPage />
    </PortalAuthGate>
  );
}
