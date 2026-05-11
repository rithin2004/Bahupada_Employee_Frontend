import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppRole } from "@/lib/navigation";

type AdminListRouteSkeletonProps = {
  role?: AppRole;
  activeKey: string;
  userName?: string;
  /** Announced to screen readers while the route chunk loads */
  title: string;
  columnLabels: string[];
  tabCount?: number;
};

/**
 * Shared route-level loading UI for admin (or employee) list pages: card + filter row + table skeletons.
 */
export function AdminListRouteSkeleton({
  role = "admin",
  activeKey,
  userName = "…",
  title,
  columnLabels,
  tabCount = 0,
}: AdminListRouteSkeletonProps) {
  const colCount = Math.max(columnLabels.length, 1);

  return (
    <AppShell role={role} activeKey={activeKey} userName={userName}>
      <span className="sr-only">Loading {title}</span>
      <div className="space-y-4">
        {tabCount > 0 ? (
          <div className="flex gap-2 border-b pb-2">
            {Array.from({ length: tabCount }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-36" />
            ))}
          </div>
        ) : null}
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-64" />
            <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Skeleton className="h-4 w-40" />
              <div className="flex w-full gap-2 md:w-auto md:justify-end">
                <Skeleton className="h-10 flex-1 md:w-80" />
                <Skeleton className="h-10 w-28" />
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {columnLabels.map((label) => (
                      <th key={label} className="px-3 py-2 text-left font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, row) => (
                    <tr key={row} className="border-t">
                      {Array.from({ length: colCount }).map((__, col) => (
                        <td key={col} className="px-3 py-2">
                          <Skeleton className="h-5 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
