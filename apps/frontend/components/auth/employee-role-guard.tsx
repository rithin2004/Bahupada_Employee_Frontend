"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { asObject, fetchWithPortalAuth, readPortalSession } from "@/lib/backend-api";
import { defaultRouteForEmployee, type EmployeeRole } from "@/lib/navigation";

type EmployeeRoleGuardProps = {
  allow: EmployeeRole[];
  children: React.ReactNode;
};

export function EmployeeRoleGuard({ allow, children }: EmployeeRoleGuardProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    async function validate() {
      try {
        const session = readPortalSession();
        if (session.portal !== "EMPLOYEE" || !session.accessToken) {
          router.replace("/auth/employee-login");
          return;
        }
        const response = await fetchWithPortalAuth("/auth/me", { method: "GET" });
        if (!response.ok) {
          router.replace("/auth/employee-login");
          return;
        }
        const payload = asObject(await response.json().catch(() => ({})));
        const employeeRole = typeof payload.employee_role === "string" ? (payload.employee_role as EmployeeRole) : null;
        if (!employeeRole || !allow.includes(employeeRole)) {
          router.replace(defaultRouteForEmployee(employeeRole));
          return;
        }
        if (active) {
          setReady(true);
        }
      } catch {
        router.replace("/auth/employee-login");
      }
    }
    void validate();
    return () => {
      active = false;
    };
  }, [allow, router]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking access...</div>;
  }

  return <>{children}</>;
}
