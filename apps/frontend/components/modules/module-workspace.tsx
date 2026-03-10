import Link from "next/link";
import { ArrowRight, Clock3, Plus, RefreshCw } from "lucide-react";

import type { AppRole } from "@/lib/navigation";
import type { ModuleFilters, ModuleStatus, ModuleWorkspaceData } from "@/lib/modules/workspace-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AppShell } from "@/components/layout/app-shell";
import { ModuleSpecificPanels } from "@/components/modules/module-specific-panels";

const roleBadge: Record<AppRole, string> = {
  admin: "Admin Workspace",
  employee: "Employee Workspace",
};

const userNameByRole: Record<AppRole, string> = {
  admin: "Admin User",
  employee: "Employee User",
};

const periodLabels: Record<ModuleFilters["period"], string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

const statusLabels: Record<ModuleFilters["status"], string> = {
  all: "All",
  ready: "Ready",
  pending: "Pending",
  blocked: "Blocked",
};

function statusVariant(status: ModuleStatus) {
  if (status === "Ready") {
    return "default";
  }

  if (status === "Pending") {
    return "secondary";
  }

  return "destructive";
}

function queryFor(filters: ModuleFilters) {
  const params = new URLSearchParams();
  params.set("period", filters.period);
  params.set("status", filters.status);
  return `?${params.toString()}`;
}

type ModuleWorkspaceProps = {
  role: AppRole;
  activeKey: string;
  navLabel: string;
  basePath: string;
  filters: ModuleFilters;
  data: ModuleWorkspaceData;
};

export function ModuleWorkspace({ role, activeKey, navLabel, basePath, filters, data }: ModuleWorkspaceProps) {
  return (
    <AppShell role={role} activeKey={activeKey} userName={userNameByRole[role]}>
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-foreground">{navLabel}</span>
          </div>
          <Badge variant="outline">{roleBadge[role]}</Badge>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">{navLabel}</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{data.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button size="sm">
              <Plus className="size-4" />
              New Entry
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(["today", "week", "month"] as const).map((period) => (
              <Button
                key={period}
                asChild
                size="sm"
                variant={filters.period === period ? "default" : "outline"}
              >
                <Link href={`${basePath}${queryFor({ ...filters, period })}`}>{periodLabels[period]}</Link>
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["all", "ready", "pending", "blocked"] as const).map((status) => (
              <Button
                key={status}
                asChild
                size="sm"
                variant={filters.status === status ? "default" : "outline"}
              >
                <Link href={`${basePath}${queryFor({ ...filters, status })}`}>{statusLabels[status]}</Link>
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {data.metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader className="gap-1">
                <CardDescription>{metric.label}</CardDescription>
                <CardTitle className="text-2xl">{metric.value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{metric.change}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>{data.title} Queue</CardTitle>
              <CardDescription>Current operational items needing action.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>ETA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.tasks.map((task) => (
                    <TableRow key={task.item}>
                      <TableCell>{task.item}</TableCell>
                      <TableCell>{task.owner}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(task.status)}>{task.status}</Badge>
                      </TableCell>
                      <TableCell>{task.eta}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data.tasks.length === 0 ? (
                <p className="pt-3 text-sm text-muted-foreground">No items match the selected filters.</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common actions for faster module operations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-between">
                  Open prioritized tasks
                  <ArrowRight className="size-4" />
                </Button>
                <Button variant="outline" className="w-full justify-between">
                  Review pending approvals
                  <ArrowRight className="size-4" />
                </Button>
                <Button variant="outline" className="w-full justify-between">
                  Export module report
                  <ArrowRight className="size-4" />
                </Button>
                <div className="rounded-lg border border-dashed p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next checkpoint</p>
                  <p className="mt-1 flex items-center gap-2 text-sm">
                    <Clock3 className="size-4 text-muted-foreground" />
                    Daily review at 5:30 PM
                  </p>
                </div>
              </CardContent>
            </Card>
            <ModuleSpecificPanels moduleKey={activeKey} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
