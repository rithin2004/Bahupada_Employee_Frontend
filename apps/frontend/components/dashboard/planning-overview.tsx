import { CalendarClock, Route, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function PlanningOverview() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Delivery Duty Assignment</CardTitle>
          <CardDescription>Assign crew and vehicle for daily runs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <span>Feb 20, 2026</span>
            </div>
            <Badge>8 runs</Badge>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-muted-foreground" />
              <span>Drivers assigned</span>
            </div>
            <span className="font-medium">8 / 8</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Route className="size-4 text-muted-foreground" />
              <span>Route optimization</span>
            </div>
            <Badge variant="secondary">Pending 2</Badge>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full" variant="outline">
            Open Duty Planner
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salesman Monthly Calendar</CardTitle>
          <CardDescription>Admin-driven route allocation for each day.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Coverage Progress</p>
            <p className="text-xs text-muted-foreground">26 out of 28 days assigned</p>
            <Separator className="my-3" />
            <div className="flex items-center justify-between text-sm">
              <span>Unassigned days</span>
              <Badge variant="destructive">2</Badge>
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-sm font-medium">Top Route Load</p>
            <p className="text-sm text-muted-foreground">North-12 assigned for 10 day-slots</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button className="w-full">Open Sales Calendar</Button>
        </CardFooter>
      </Card>
    </div>
  );
}
