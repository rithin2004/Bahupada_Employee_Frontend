import { PortalAuthGate } from "@/components/auth/portal-auth-gate";

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <PortalAuthGate portal="EMPLOYEE">{children}</PortalAuthGate>;
}
