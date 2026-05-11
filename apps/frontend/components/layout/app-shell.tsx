"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";

import { EntryNavigationGuardProvider, useEntryNavigationGuard } from "@/components/modules/entry-navigation-guard";
import { asArray, asObject, clearPortalSession, fetchBackend, fetchPortalMe, fetchWithPortalAuth, postBackend } from "@/lib/backend-api";
import type { AppRole, EmployeeRole } from "@/lib/navigation";
import { defaultRouteForAdmin, defaultRouteForEmployee, modulesForRole } from "@/lib/navigation";
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

export function AppShell(props: AppShellProps) {
  return (
    <EntryNavigationGuardProvider>
      <AppShellInner {...props} />
    </EntryNavigationGuardProvider>
  );
}

function AppShellInner({ role, activeKey, userName, children }: AppShellProps) {
  const router = useRouter();
  const { peekDraftDirty, tryNavigateAway } = useEntryNavigationGuard();

  const onGuardedNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, href: string, afterNavigate?: () => void) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      if (!peekDraftDirty()) {
        return;
      }
      e.preventDefault();
      void tryNavigateAway().then((ok) => {
        if (ok) {
          router.push(href);
          afterNavigate?.();
        }
      });
    },
    [peekDraftDirty, tryNavigateAway, router],
  );

  const [authResolved, setAuthResolved] = useState(false);
  const [employeeRole, setEmployeeRole] = useState<EmployeeRole | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<Record<string, { read?: boolean; write?: boolean }>>({});
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarExpanded, setDesktopSidebarExpanded] = useState(false);
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
        const payload = await fetchPortalMe();
        if (!active) {
          return;
        }
        const nextRole = typeof payload.employee_role === "string" ? (payload.employee_role as EmployeeRole) : null;
        setEmployeeRole(nextRole);
        setIsSuperAdmin(Boolean(payload.is_super_admin));
        setAdminPermissions(asObject(payload.admin_permissions) as Record<string, { read?: boolean; write?: boolean }>);
        setAuthResolved(true);
      } catch {
        if (active) {
          setEmployeeRole(null);
          setIsSuperAdmin(false);
          setAdminPermissions({});
          setAuthResolved(true);
        }
      }
    }
    void loadAuthInfo();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!mobileSidebarOpen) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileSidebarOpen]);

  const modules = modulesForRole(role, employeeRole, adminPermissions, isSuperAdmin);

  useEffect(() => {
    if (role !== "admin") {
      return;
    }
    if (!authResolved) {
      return;
    }
    const allowed = modules.some((module) => module.key === activeKey);
    if (!allowed) {
      router.replace(defaultRouteForAdmin(adminPermissions, isSuperAdmin));
    }
  }, [activeKey, adminPermissions, authResolved, isSuperAdmin, modules, role, router]);

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
    const ok = await tryNavigateAway();
    if (!ok) {
      return;
    }
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
    const ok = await tryNavigateAway();
    if (!ok) {
      return;
    }
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
      {mobileSidebarOpen ? (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-40 bg-black/45 transition-opacity duration-300 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-h-screen w-full">
        <div
          className="relative hidden lg:block lg:w-[88px] lg:shrink-0"
          onMouseEnter={() => setDesktopSidebarExpanded(true)}
          onMouseLeave={() => setDesktopSidebarExpanded(false)}
        >
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-30 hidden border-r bg-card/98 shadow-sm backdrop-blur transition-[width] duration-200 ease-out lg:block",
              desktopSidebarExpanded ? "w-[248px]" : "w-[88px]"
            )}
          >
            <div className="flex h-full min-h-0 flex-col p-2.5">
              <div
                className={cn(
                  "mb-2 flex shrink-0 items-center",
                  desktopSidebarExpanded ? "justify-between gap-2" : "justify-center",
                )}
              >
                <div className={cn("min-w-0", desktopSidebarExpanded ? "opacity-100" : "w-0 overflow-hidden opacity-0")}>
                  <p className="truncate text-[11px] uppercase tracking-[0.28em] text-muted-foreground">Bahupada ERP</p>
                  <h2 className="mt-1 truncate text-base font-semibold">Control Panel</h2>
                </div>
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted font-semibold">
                  {role === "admin" ? "A" : "E"}
                </div>
              </div>
              <Separator className="mb-2 shrink-0" />

              <nav className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable]">
                {modules.map((module) => {
                  const isActive = activeKey === module.key;
                  return (
                    <Button
                      key={module.key}
                      asChild
                      variant={isActive ? "secondary" : "ghost"}
                      className={cn(
                        "h-10 overflow-hidden px-0",
                        desktopSidebarExpanded ? "w-full justify-start gap-3 px-3" : "mx-auto w-10 justify-center"
                      )}
                      title={module.label}
                    >
                      <Link href={module.href} onClick={(e) => onGuardedNavClick(e, module.href)}>
                        <module.icon className="size-4 shrink-0" />
                        <span className={cn("truncate transition-opacity duration-150", desktopSidebarExpanded ? "opacity-100" : "hidden opacity-0")}>
                          {module.label}
                        </span>
                      </Link>
                    </Button>
                  );
                })}
              </nav>

              <Separator className="my-2 shrink-0" />
              <div className={cn("shrink-0 space-y-2", desktopSidebarExpanded ? "opacity-100" : "opacity-0")}>
                {desktopSidebarExpanded ? (
                  <>
                    <Badge variant="outline" className="capitalize">
                      {role}
                    </Badge>
                    <div className="space-y-2 rounded-xl border p-3 text-xs">
                      <p className="font-medium">Portal Separation</p>
                      <div className="flex flex-col gap-2">
                        <Button asChild variant="outline" size="sm" className="w-full justify-start">
                          <Link href="/auth/admin-login" onClick={(e) => onGuardedNavClick(e, "/auth/admin-login")}>
                            Admin Login
                          </Link>
                        </Button>
                        <Button asChild variant="outline" size="sm" className="w-full justify-start">
                          <Link href="/auth/employee-login" onClick={(e) => onGuardedNavClick(e, "/auth/employee-login")}>
                            Employee Login
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[285px] max-w-[86vw] flex-col overflow-hidden border-r bg-card p-4 shadow-xl transition-transform duration-300 ease-out lg:hidden",
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-4 shrink-0 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bahupada ERP</p>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close sidebar"
                onClick={() => setMobileSidebarOpen(false)}
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
          <Separator className="mb-4 shrink-0" />

          <nav className="min-h-0 flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable] pr-0.5">
            {modules.map((module) => {
              const isActive = activeKey === module.key;
              return (
                <Button
                  key={module.key}
                  asChild
                  variant={isActive ? "secondary" : "ghost"}
                  className="w-full justify-start"
                >
                  <Link
                    href={module.href}
                    onClick={(e) => onGuardedNavClick(e, module.href, () => setMobileSidebarOpen(false))}
                  >
                    <module.icon className="size-4" />
                    {module.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="border-b bg-card px-4 py-3 md:px-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="mt-0.5 lg:hidden"
                  aria-label="Open sidebar menu"
                  onClick={() => setMobileSidebarOpen(true)}
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
          <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">{children}</main>
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
