"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";

import { clearPortalSession, fetchWithPortalAuth } from "@/lib/backend-api";
import type { AppRole } from "@/lib/navigation";
import { modulesForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type AppShellProps = {
  role: AppRole;
  activeKey: string;
  userName: string;
  children: React.ReactNode;
};

export function AppShell({ role, activeKey, userName, children }: AppShellProps) {
  const router = useRouter();
  const modules = modulesForRole(role);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!sidebarOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  async function handleLogout() {
    try {
      await fetchWithPortalAuth("/auth/logout", { method: "POST" });
    } catch {
      // Best-effort revoke.
    }
    clearPortalSession();
    router.replace(role === "admin" ? "/auth/admin-login" : "/auth/employee-login");
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-muted/30">
      {sidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[285px] max-w-[86vw] border-r bg-card p-4 shadow-xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none",
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bahupada ERP</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="lg:hidden"
                aria-label="Close sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Control Panel</h2>
              <Badge variant="outline" className="capitalize">
                {role}
              </Badge>
            </div>
          </div>
          <Separator className="mb-4" />

          <nav className="space-y-1">
            {modules.map((module) => {
              const isActive = activeKey === module.key;
              return (
                <Button
                  key={module.key}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <Link href={module.href} onClick={() => setSidebarOpen(false)}>
                    <module.icon className="size-4" />
                    {module.label}
                  </Link>
                </Button>
              );
            })}
          </nav>

          <Separator className="my-4" />
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p className="font-medium">Login Separation</p>
            <p className="text-muted-foreground">Admin and Employee portals should authenticate separately.</p>
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/auth/admin-login">Admin Login</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/auth/employee-login">Employee Login</Link>
              </Button>
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="border-b bg-card px-4 py-3 md:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="mt-0.5 lg:hidden"
                  aria-label="Open sidebar menu"
                  onClick={() => setSidebarOpen(true)}
                >
                  <Menu className="size-4" />
                </Button>
                <div>
                  <h1 className="text-lg font-semibold">Operations Workspace</h1>
                  <p className="text-sm text-muted-foreground">Welcome, {userName}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full min-w-[220px] md:w-72">
                  <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search invoice, customer, SKU" />
                </div>
                <ThemeToggle />
                <Button variant="outline" size="icon" aria-label="alerts">
                  <Bell className="size-4" />
                </Button>
                <Button variant="outline" size="icon" aria-label="logout" onClick={() => void handleLogout()}>
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>
          </header>
          <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
