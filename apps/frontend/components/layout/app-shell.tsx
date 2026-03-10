"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";

import { asArray, asObject, clearPortalSession, fetchBackend, fetchWithPortalAuth, postBackend } from "@/lib/backend-api";
import type { AppRole, EmployeeRole } from "@/lib/navigation";
import { defaultRouteForEmployee, modulesForRole } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme/theme-toggle";

type AppShellProps = {
  role: AppRole;
  activeKey: string;
  userName: string;
  children: React.ReactNode;
};

export function AppShell({ role, activeKey, userName, children }: AppShellProps) {
  const router = useRouter();
  const [employeeRole, setEmployeeRole] = useState<EmployeeRole | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notifications, setNotifications] = useState<
    Array<{
      id: string;
      title: string;
      message: string;
      type: string;
      entity_type: string | null;
      entity_id: string | null;
      is_read: boolean;
      created_at: string;
    }>
  >([]);

  useEffect(() => {
    let active = true;
    async function loadAuthInfo() {
      try {
        const payload = asObject(await fetchBackend("/auth/me"));
        if (!active) {
          return;
        }
        const nextRole = typeof payload.employee_role === "string" ? (payload.employee_role as EmployeeRole) : null;
        setEmployeeRole(nextRole);
      } catch {
        if (active) {
          setEmployeeRole(null);
        }
      }
    }
    void loadAuthInfo();
    return () => {
      active = false;
    };
  }, []);

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

  const modules = modulesForRole(role, employeeRole);

  async function loadNotifications() {
    setNotificationsLoading(true);
    try {
      const response = asObject(await fetchBackend("/delivery-workflow/notifications?limit=10"));
      setNotifications(
        asArray(response.items).map((item) => ({
          id: String(item.id ?? ""),
          title: String(item.title ?? "Notification"),
          message: String(item.message ?? ""),
          type: String(item.type ?? "-"),
          entity_type: item.entity_type == null ? null : String(item.entity_type),
          entity_id: item.entity_id == null ? null : String(item.entity_id),
          is_read: Boolean(item.is_read),
          created_at: String(item.created_at ?? ""),
        }))
      );
    } catch {
      setNotifications([]);
    } finally {
      setNotificationsLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();
  }, []);

  useEffect(() => {
    if (notificationsOpen) {
      void loadNotifications();
    }
  }, [notificationsOpen]);

  async function handleLogout() {
    try {
      await fetchWithPortalAuth("/auth/logout", { method: "POST" });
    } catch {
      // Best-effort revoke.
    }
    clearPortalSession();
    router.replace(role === "admin" ? "/auth/admin-login" : "/auth/employee-login");
  }

  async function markNotificationRead(notificationId: string) {
    try {
      await postBackend(`/delivery-workflow/notifications/${notificationId}/read`, {});
      setNotifications((prev) => prev.map((item) => (item.id === notificationId ? { ...item, is_read: true } : item)));
    } catch {
      // ignore
    }
  }

  function notificationTarget(entityType: string | null): string {
    if (role === "admin") {
      if (entityType === "invoice_assignment_batch" || entityType === "delivery_run" || entityType === "delivery_run_stop") {
        return "/sales-invoices";
      }
      return "/dashboard";
    }
    if (entityType === "invoice_assignment_batch") {
      return employeeRole === "SUPERVISOR" ? "/verification" : "/tasks";
    }
    if (entityType === "delivery_run" || entityType === "delivery_run_stop") {
      return "/dispatch";
    }
    return defaultRouteForEmployee(employeeRole);
  }

  async function handleNotificationClick(item: { id: string; entity_type: string | null }) {
    await markNotificationRead(item.id);
    setNotificationsOpen(false);
    router.push(notificationTarget(item.entity_type));
  }

  async function markAllNotificationsRead() {
    try {
      await postBackend("/delivery-workflow/notifications/read-all", { notification_ids: null });
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
    } catch {
      // ignore
    }
  }

  const unreadCount = notifications.filter((item) => !item.is_read).length;

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
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="alerts"
                  className="relative"
                  onClick={() => setNotificationsOpen(true)}
                >
                  <Bell className="size-4" />
                  {unreadCount > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-zinc-900 px-1.5 text-[10px] text-white dark:bg-zinc-100 dark:text-zinc-900">
                      {unreadCount}
                    </span>
                  ) : null}
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
      <Dialog open={notificationsOpen} onOpenChange={setNotificationsOpen}>
        <DialogContent className="max-h-[85vh] w-[92vw] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notifications</DialogTitle>
            <DialogDescription>Assignments, verification requests, and dispatch updates.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => void markAllNotificationsRead()} disabled={unreadCount === 0}>
              Mark all read
            </Button>
          </div>
          <div className="space-y-3">
            {notificationsLoading ? (
              Array.from({ length: 5 }).map((_, index) => <Skeleton key={`notification-skeleton-${index}`} className="h-20 w-full" />)
            ) : notifications.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
            ) : (
              notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "block w-full rounded-xl border p-4 text-left transition",
                    item.is_read ? "border-zinc-200 opacity-80 dark:border-zinc-800" : "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900/50"
                  )}
                  onClick={() => void handleNotificationClick(item)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{item.title}</p>
                    <Badge variant="outline" className="uppercase">{item.type.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString("en-IN")}</p>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
