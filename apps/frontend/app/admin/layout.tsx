import { PortalAuthGate } from "@/components/auth/portal-auth-gate";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <PortalAuthGate portal="ADMIN">{children}</PortalAuthGate>;
}
