import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type ModuleSpecificPanelsProps = {
  moduleKey: string;
};

function PanelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProcurementPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Commitments</CardTitle>
        <CardDescription>Upcoming inbound commitments across top vendors.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <PanelRow label="Apex Polymers" value="12 pallets - 14:30" />
        <PanelRow label="Delta Pack" value="7 pallets - 17:00" />
        <PanelRow label="North Mill" value="4 pallets - Tomorrow 10:00" />
      </CardContent>
    </Card>
  );
}

function FinancePanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cashflow Watchlist</CardTitle>
        <CardDescription>High impact payments and collection risk items.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <PanelRow label="Collection gap" value="$8.4K" />
        <PanelRow label="Disputed invoices" value="6" />
        <PanelRow label="Urgent payables" value="$3.1K" />
      </CardContent>
    </Card>
  );
}

function DeliveryPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Run Health</CardTitle>
        <CardDescription>Live route exception snapshot for dispatch control.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <PanelRow label="Delayed departures" value="2 routes" />
        <PanelRow label="Proof of delivery lag" value="7 drops" />
        <PanelRow label="Fuel variance alert" value="1 vehicle" />
      </CardContent>
    </Card>
  );
}

function HRPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workforce Exceptions</CardTitle>
        <CardDescription>Attendance and payroll anomalies to resolve today.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <PanelRow label="Missing check-ins" value="4 employees" />
        <PanelRow label="Overtime mismatches" value="3 entries" />
        <PanelRow label="Joining forms pending" value="2 new hires" />
      </CardContent>
    </Card>
  );
}

function GeneralPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Module Notes</CardTitle>
        <CardDescription>Context-aware status flags for this module.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Badge variant="secondary">Operational</Badge>
        <Badge variant="outline">Stable</Badge>
        <Badge variant="outline">No escalations</Badge>
      </CardContent>
    </Card>
  );
}

export function ModuleSpecificPanels({ moduleKey }: ModuleSpecificPanelsProps) {
  if (moduleKey === "procurement") {
    return <ProcurementPanel />;
  }

  if (moduleKey === "finance") {
    return <FinancePanel />;
  }

  if (moduleKey === "delivery") {
    return <DeliveryPanel />;
  }

  if (moduleKey === "hr") {
    return <HRPanel />;
  }

  return <GeneralPanel />;
}
