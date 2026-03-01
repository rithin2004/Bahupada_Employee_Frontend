"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  asObject,
  clearCustomerSession,
  CUSTOMER_AUTH_STORAGE_KEY,
  fetchWithCustomerAuth,
  readCustomerSession,
} from "@/lib/auth-session";

export function CustomerAuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const bypass = pathname === "/login";

  useEffect(() => {
    let active = true;
    async function validate() {
      try {
        const session = readCustomerSession();
        const token = session.accessToken;
        if (!token) {
          router.replace("/login");
          return;
        }
        const response = await fetchWithCustomerAuth("/auth/me", { method: "GET" });
        if (!response.ok) {
          clearCustomerSession();
          router.replace("/login");
          return;
        }
        const payload = asObject(await response.json().catch(() => ({})));
        if (String(payload.portal ?? "") !== "CUSTOMER") {
          clearCustomerSession();
          router.replace("/login");
          return;
        }
        if (active) {
          setReady(true);
        }
      } catch {
        clearCustomerSession();
        router.replace("/login");
      }
    }

    if (bypass) {
      return;
    }

    void validate();
    return () => {
      active = false;
    };
  }, [bypass, router]);

  if (bypass) {
    return <>{children}</>;
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Checking session...</div>;
  }

  return <>{children}</>;
}

export { CUSTOMER_AUTH_STORAGE_KEY };
