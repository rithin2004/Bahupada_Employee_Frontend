"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { clearPortalSession, fetchWithPortalAuth, readPortalSession, asObject } from "@/lib/backend-api";

type PortalAuthGateProps = {
  portal: "ADMIN" | "EMPLOYEE" | "ANY";
  children: React.ReactNode;
};

export function PortalAuthGate({ portal, children }: PortalAuthGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const bypass = pathname.startsWith("/auth/");

  useEffect(() => {
    let active = true;
    const fallbackLoginHref = portal === "ADMIN" ? "/auth/admin-login" : portal === "EMPLOYEE" ? "/auth/employee-login" : "/";
    async function validate() {
      try {
        const session = readPortalSession();
        const token = session.accessToken;
        const tokenPortal = session.portal;
        if (!token || (portal !== "ANY" && tokenPortal !== portal)) {
          clearPortalSession();
          router.replace(fallbackLoginHref);
          return;
        }
        const response = await fetchWithPortalAuth("/auth/me", { method: "GET" });
        if (!response.ok) {
          clearPortalSession();
          router.replace(fallbackLoginHref);
          return;
        }
        const payload = asObject(await response.json().catch(() => ({})));
        if (portal !== "ANY" && String(payload.portal ?? "") !== portal) {
          clearPortalSession();
          router.replace(fallbackLoginHref);
          return;
        }
        if (active) {
          setReady(true);
        }
      } catch {
        clearPortalSession();
        router.replace(fallbackLoginHref);
      }
    }
    if (bypass) {
      return;
    }
    void validate();
    return () => {
      active = false;
    };
  }, [bypass, portal, router]);

  if (bypass) {
    return <>{children}</>;
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Checking session...</div>;
  }

  return <>{children}</>;
}
