"use client";

import { useEffect, useState } from "react";

import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { AppShell } from "@/components/layout/app-shell";
import { asObject, fetchBackend } from "@/lib/backend-api";
import type { AppRole } from "@/lib/navigation";

export default function DashboardPage() {
  const [role, setRole] = useState<AppRole>("employee");
  const [userName, setUserName] = useState("User");

  useEffect(() => {
    let active = true;
    async function loadMe() {
      try {
        const payload = asObject(await fetchBackend("/auth/me"));
        if (!active) {
          return;
        }
        setRole(String(payload.portal ?? "") === "ADMIN" ? "admin" : "employee");
        setUserName(String(payload.full_name ?? payload.display_name ?? "User"));
      } catch {
        if (active) {
          setRole("employee");
          setUserName("User");
        }
      }
    }
    void loadMe();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalAuthGate portal="ANY">
      <AppShell role={role} activeKey="dashboard" userName={userName}>
        <DashboardHome />
      </AppShell>
    </PortalAuthGate>
  );
}
