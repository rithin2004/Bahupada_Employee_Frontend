"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, postBackend } from "@/lib/backend-api";
import { usePersistedUiState } from "@/lib/state/pagination-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PlannerTab = "salesman" | "delivery";
type PlannerMode = "weekly" | "monthly";

type PersistedPlannerState = {
  activeTab: PlannerTab;
  mode: PlannerMode;
  anchorDate: string;
  selectedSalesmanPlanId: string;
  selectedDeliveryPlanId: string;
};

type PlanOption = {
  id: string;
  plan_name: string;
  month: number;
  year: number;
};

type RouteOption = {
  id: string;
  route_name: string;
};

type EmployeeOption = {
  id: string;
  full_name: string;
  role: string;
  sub_role_name: string;
  warehouse_name: string;
};

type VehicleOption = {
  id: string;
  registration_no: string;
  vehicle_name: string;
};

type VehicleFormState = {
  registration_no: string;
  vehicle_name: string;
  capacity_kg: string;
};

type SalesmanAssignment = {
  id: string;
  monthly_plan_id: string;
  duty_date: string;
  salesman_id: string;
  route_id: string;
};

type DeliveryAssignment = {
  id: string;
  monthly_plan_id: string;
  duty_date: string;
  vehicle_id: string | null;
  driver_id: string | null;
  helper_id: string | null;
  bill_manager_id: string | null;
  loader_id: string | null;
};

const DEFAULT_STATE: PersistedPlannerState = {
  activeTab: "salesman",
  mode: "monthly",
  anchorDate: new Date().toISOString().slice(0, 10),
  selectedSalesmanPlanId: "",
  selectedDeliveryPlanId: "",
};

function formatDayLabel(value: string) {
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("en-IN", { weekday: "long" });
}

function startOfWeek(value: string) {
  const d = new Date(`${value}T00:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function datesForRange(anchorDate: string, mode: PlannerMode) {
  const base = new Date(`${anchorDate}T00:00:00`);
  if (mode === "weekly") {
    const start = new Date(`${startOfWeek(anchorDate)}T00:00:00`);
    return Array.from({ length: 7 }, (_, index) => {
      const next = new Date(start);
      next.setDate(start.getDate() + index);
      return next.toISOString().slice(0, 10);
    });
  }

  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  return Array.from({ length: last.getDate() }, (_, index) => {
    const next = new Date(first);
    next.setDate(first.getDate() + index);
    return next.toISOString().slice(0, 10);
  });
}

function monthYearFromAnchor(anchorDate: string) {
  const d = new Date(`${anchorDate}T00:00:00`);
  return {
    month: d.getMonth() + 1,
    year: d.getFullYear(),
  };
}

function generatedPlanName(tab: PlannerTab, mode: PlannerMode, anchorDate: string) {
  const { month, year } = monthYearFromAnchor(anchorDate);
  const prefix = tab === "salesman" ? "Salesman" : "Delivery";
  if (mode === "weekly") {
    return `${prefix} Week of ${startOfWeek(anchorDate)}`;
  }
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return `${prefix} ${monthLabel}`;
}

function employeeLabel(employee: EmployeeOption) {
  const suffix = employee.sub_role_name ? ` | ${employee.sub_role_name}` : "";
  return `${employee.full_name}${suffix}`;
}

function cleanPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== "" && value !== undefined));
}

function mapPlan(row: Record<string, unknown>): PlanOption {
  return {
    id: String(row.id ?? ""),
    plan_name: String(row.plan_name ?? "-"),
    month: Number(row.month ?? 0),
    year: Number(row.year ?? 0),
  };
}

function mapRoute(row: Record<string, unknown>): RouteOption {
  return {
    id: String(row.id ?? ""),
    route_name: String(row.route_name ?? "-"),
  };
}

function mapEmployee(row: Record<string, unknown>): EmployeeOption {
  return {
    id: String(row.id ?? ""),
    full_name: String(row.full_name ?? "-"),
    role: String(row.role ?? ""),
    sub_role_name: String(row.sub_role_name ?? ""),
    warehouse_name: String(row.warehouse_name ?? "-"),
  };
}

function mapVehicle(row: Record<string, unknown>): VehicleOption {
  return {
    id: String(row.id ?? ""),
    registration_no: String(row.registration_no ?? "-"),
    vehicle_name: String(row.vehicle_name ?? ""),
  };
}

function mapSalesmanAssignment(row: Record<string, unknown>): SalesmanAssignment {
  return {
    id: String(row.id ?? ""),
    monthly_plan_id: String(row.monthly_plan_id ?? ""),
    duty_date: String(row.duty_date ?? ""),
    salesman_id: String(row.salesman_id ?? ""),
    route_id: String(row.route_id ?? ""),
  };
}

function mapDeliveryAssignment(row: Record<string, unknown>): DeliveryAssignment {
  return {
    id: String(row.id ?? ""),
    monthly_plan_id: String(row.monthly_plan_id ?? ""),
    duty_date: String(row.duty_date ?? ""),
    vehicle_id: row.vehicle_id ? String(row.vehicle_id) : null,
    driver_id: row.driver_id ? String(row.driver_id) : null,
    helper_id: row.helper_id ? String(row.helper_id) : null,
    bill_manager_id: row.bill_manager_id ? String(row.bill_manager_id) : null,
    loader_id: row.loader_id ? String(row.loader_id) : null,
  };
}

export function PlanningAdminEditor() {
  const { state, setState } = usePersistedUiState<PersistedPlannerState>("planning-admin", DEFAULT_STATE);
  const [mastersLoading, setMastersLoading] = useState(true);
  const [plansLoading, setPlansLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [savingCellKey, setSavingCellKey] = useState("");
  const [planCreating, setPlanCreating] = useState(false);
  const [planDeleting, setPlanDeleting] = useState(false);

  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [salesmanPlans, setSalesmanPlans] = useState<PlanOption[]>([]);
  const [deliveryPlans, setDeliveryPlans] = useState<PlanOption[]>([]);
  const [salesmanAssignments, setSalesmanAssignments] = useState<SalesmanAssignment[]>([]);
  const [deliveryAssignments, setDeliveryAssignments] = useState<DeliveryAssignment[]>([]);
  const [feedback, setFeedback] = useState("");
  const [openVehicleDialog, setOpenVehicleDialog] = useState(false);
  const [vehicleSubmitting, setVehicleSubmitting] = useState(false);
  const [vehicleForm, setVehicleForm] = useState<VehicleFormState>({
    registration_no: "",
    vehicle_name: "",
    capacity_kg: "",
  });

  const normalizedAnchorDate = useMemo(
    () => (state.mode === "weekly" ? startOfWeek(state.anchorDate) : state.anchorDate),
    [state.anchorDate, state.mode]
  );
  const visibleDates = useMemo(() => datesForRange(normalizedAnchorDate, state.mode), [normalizedAnchorDate, state.mode]);
  const salesmanOptions = useMemo(
    () => employees.filter((employee) => employee.role === "SALESMAN"),
    [employees]
  );
  const deliveryEmployeeOptions = useMemo(
    () =>
      employees.filter((employee) =>
        ["DELIVERY_EMPLOYEE", "DRIVER", "IN_VEHICLE_HELPER", "BILL_MANAGER", "LOADER"].includes(employee.role)
      ),
    [employees]
  );
  const selectedPlanId = state.activeTab === "salesman" ? state.selectedSalesmanPlanId : state.selectedDeliveryPlanId;

  const salesmanAssignmentMap = useMemo(() => {
    const map = new Map<string, SalesmanAssignment>();
    for (const assignment of salesmanAssignments) {
      map.set(`${assignment.duty_date}::${assignment.salesman_id}`, assignment);
    }
    return map;
  }, [salesmanAssignments]);

  const deliveryAssignmentMap = useMemo(() => {
    const map = new Map<string, DeliveryAssignment>();
    for (const assignment of deliveryAssignments) {
      map.set(assignment.duty_date, assignment);
    }
    return map;
  }, [deliveryAssignments]);

  const loadMasters = useCallback(async () => {
    setMastersLoading(true);
    setFeedback("");
    try {
      const [routesRes, employeesRes, vehiclesRes] = await Promise.all([
        fetchBackend("/masters/routes?page=1&page_size=100"),
        fetchBackend("/masters/employees?page=1&page_size=100"),
        fetchBackend("/masters/vehicles?page=1&page_size=100"),
      ]);
      setRoutes(asArray(asObject(routesRes).items).map(mapRoute));
      setEmployees(asArray(asObject(employeesRes).items).map(mapEmployee));
      setVehicles(asArray(asObject(vehiclesRes).items).map(mapVehicle));
    } catch (error) {
      setFeedback(`Failed to load planner masters: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setMastersLoading(false);
    }
  }, []);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setFeedback("");
    try {
      const { month, year } = monthYearFromAnchor(normalizedAnchorDate);
      const params = new URLSearchParams({ month: String(month), year: String(year) });
      const [salesmanRes, deliveryRes] = await Promise.all([
        fetchBackend(`/planning/salesman/monthly-plans?${params.toString()}`),
        fetchBackend(`/planning/delivery/monthly-plans?${params.toString()}`),
      ]);
      const nextSalesmanPlans = asArray(salesmanRes).map(mapPlan);
      const nextDeliveryPlans = asArray(deliveryRes).map(mapPlan);
      setSalesmanPlans(nextSalesmanPlans);
      setDeliveryPlans(nextDeliveryPlans);
      const nextSelectedSalesmanPlanId = nextSalesmanPlans.some((plan) => plan.id === state.selectedSalesmanPlanId)
        ? state.selectedSalesmanPlanId
        : nextSalesmanPlans[0]?.id ?? "";
      const nextSelectedDeliveryPlanId = nextDeliveryPlans.some((plan) => plan.id === state.selectedDeliveryPlanId)
        ? state.selectedDeliveryPlanId
        : nextDeliveryPlans[0]?.id ?? "";
      if (
        nextSelectedSalesmanPlanId !== state.selectedSalesmanPlanId ||
        nextSelectedDeliveryPlanId !== state.selectedDeliveryPlanId
      ) {
        setState({
          activeTab: state.activeTab,
          mode: state.mode,
          anchorDate: state.anchorDate,
          selectedSalesmanPlanId: nextSelectedSalesmanPlanId,
          selectedDeliveryPlanId: nextSelectedDeliveryPlanId,
        });
      }
    } catch (error) {
      setFeedback(`Failed to load plans: ${error instanceof Error ? error.message : "Unknown error"}`);
      setSalesmanPlans([]);
      setDeliveryPlans([]);
    } finally {
      setPlansLoading(false);
    }
  }, [
    normalizedAnchorDate,
    setState,
    state.activeTab,
    state.anchorDate,
    state.mode,
    state.selectedDeliveryPlanId,
    state.selectedSalesmanPlanId,
  ]);

  const loadAssignments = useCallback(async () => {
    const activePlanId = state.activeTab === "salesman" ? state.selectedSalesmanPlanId : state.selectedDeliveryPlanId;
    if (!activePlanId) {
      if (state.activeTab === "salesman") {
        setSalesmanAssignments([]);
      } else {
        setDeliveryAssignments([]);
      }
      return;
    }
    setAssignmentsLoading(true);
    setFeedback("");
    try {
      const response = await fetchBackend(
        state.activeTab === "salesman"
          ? `/planning/salesman/monthly-plans/${activePlanId}/assignments`
          : `/planning/delivery/monthly-plans/${activePlanId}/assignments`
      );
      if (state.activeTab === "salesman") {
        setSalesmanAssignments(asArray(response).map(mapSalesmanAssignment));
      } else {
        setDeliveryAssignments(asArray(response).map(mapDeliveryAssignment));
      }
    } catch (error) {
      setFeedback(`Failed to load assignments: ${error instanceof Error ? error.message : "Unknown error"}`);
      if (state.activeTab === "salesman") {
        setSalesmanAssignments([]);
      } else {
        setDeliveryAssignments([]);
      }
    } finally {
      setAssignmentsLoading(false);
    }
  }, [state.activeTab, state.selectedDeliveryPlanId, state.selectedSalesmanPlanId]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  async function createPlan() {
    const activeTab = state.activeTab;
    const { month, year } = monthYearFromAnchor(normalizedAnchorDate);
    const plan_name = generatedPlanName(activeTab, state.mode, normalizedAnchorDate);
    setPlanCreating(true);
    try {
      const created = asObject(
        await postBackend(
          activeTab === "salesman" ? "/planning/salesman/monthly-plans" : "/planning/delivery/monthly-plans",
          { plan_name, month, year }
        )
      );
      const planId = String(created.id ?? "");
      await loadPlans();
      setState({
        ...state,
        selectedSalesmanPlanId: activeTab === "salesman" ? planId : state.selectedSalesmanPlanId,
        selectedDeliveryPlanId: activeTab === "delivery" ? planId : state.selectedDeliveryPlanId,
      });
      toast.success(`${activeTab === "salesman" ? "Salesman" : "Delivery"} plan created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create plan");
    } finally {
      setPlanCreating(false);
    }
  }

  async function deletePlan() {
    if (!selectedPlanId) {
      return;
    }
    setPlanDeleting(true);
    try {
      await deleteBackend(
        state.activeTab === "salesman"
          ? `/planning/salesman/monthly-plans/${selectedPlanId}`
          : `/planning/delivery/monthly-plans/${selectedPlanId}`
      );
      if (state.activeTab === "salesman") {
        setSalesmanAssignments([]);
        setState({ ...state, selectedSalesmanPlanId: "" });
      } else {
        setDeliveryAssignments([]);
        setState({ ...state, selectedDeliveryPlanId: "" });
      }
      await loadPlans();
      toast.success("Plan deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete plan");
    } finally {
      setPlanDeleting(false);
    }
  }

  async function handleSalesmanRouteChange(dutyDate: string, salesmanId: string, routeId: string) {
    if (!state.selectedSalesmanPlanId) {
      toast.error("Create or select a salesman plan first.");
      return;
    }
    const cellKey = `${dutyDate}::${salesmanId}`;
    const existing = salesmanAssignmentMap.get(cellKey);
    setSavingCellKey(`salesman::${cellKey}`);
    try {
      if (!routeId) {
        if (existing) {
          await deleteBackend(`/planning/salesman/monthly-plans/${state.selectedSalesmanPlanId}/assignments/${existing.id}`);
          setSalesmanAssignments((prev) => prev.filter((row) => row.id !== existing.id));
        }
      } else {
        const created = asObject(
          await postBackend(`/planning/salesman/monthly-plans/${state.selectedSalesmanPlanId}/assignments`, {
            duty_date: dutyDate,
            salesman_id: salesmanId,
            route_id: routeId,
            note: null,
            is_override: false,
          })
        );
        const next = mapSalesmanAssignment(created);
        setSalesmanAssignments((prev) => {
          const remaining = prev.filter((row) => row.id !== next.id && !(row.duty_date === dutyDate && row.salesman_id === salesmanId));
          return [...remaining, next];
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update salesman assignment");
    } finally {
      setSavingCellKey("");
    }
  }

  async function handleDeliveryFieldChange(
    dutyDate: string,
    field: keyof Pick<DeliveryAssignment, "vehicle_id" | "driver_id" | "helper_id" | "bill_manager_id" | "loader_id">,
    value: string
  ) {
    if (!state.selectedDeliveryPlanId) {
      toast.error("Create or select a delivery plan first.");
      return;
    }
    const existing = deliveryAssignmentMap.get(dutyDate);
    const payload = {
      duty_date: dutyDate,
      vehicle_id: existing?.vehicle_id ?? null,
      driver_id: existing?.driver_id ?? null,
      helper_id: existing?.helper_id ?? null,
      bill_manager_id: existing?.bill_manager_id ?? null,
      loader_id: existing?.loader_id ?? null,
      [field]: value || null,
    };
    const allBlank = !payload.vehicle_id && !payload.driver_id && !payload.helper_id && !payload.bill_manager_id && !payload.loader_id;
    setSavingCellKey(`delivery::${dutyDate}::${field}`);
    try {
      if (allBlank) {
        if (existing) {
          await deleteBackend(`/planning/delivery/monthly-plans/${state.selectedDeliveryPlanId}/assignments/${existing.id}`);
          setDeliveryAssignments((prev) => prev.filter((row) => row.id !== existing.id));
        }
      } else {
        const created = asObject(
          await postBackend(`/planning/delivery/monthly-plans/${state.selectedDeliveryPlanId}/assignments`, payload)
        );
        const next = mapDeliveryAssignment(created);
        setDeliveryAssignments((prev) => {
          const remaining = prev.filter((row) => row.id !== next.id && row.duty_date !== dutyDate);
          return [...remaining, next];
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update delivery assignment");
    } finally {
      setSavingCellKey("");
    }
  }

  const planOptions = state.activeTab === "salesman" ? salesmanPlans : deliveryPlans;
  const salesmanMissingEmployees = salesmanOptions.length === 0;
  const salesmanMissingRoutes = routes.length === 0;
  const deliveryMissingEmployees = deliveryEmployeeOptions.length === 0;
  const deliveryMissingVehicles = vehicles.length === 0;

  async function createVehicleInline() {
    setVehicleSubmitting(true);
    try {
      const payload = cleanPayload({
        registration_no: vehicleForm.registration_no.trim(),
        vehicle_name: vehicleForm.vehicle_name.trim(),
        capacity_kg: vehicleForm.capacity_kg.trim() ? Number(vehicleForm.capacity_kg) : undefined,
      });
      const created = asObject(await postBackend("/masters/vehicles", payload));
      setVehicles((prev) => [mapVehicle(created), ...prev]);
      setVehicleForm({ registration_no: "", vehicle_name: "", capacity_kg: "" });
      setOpenVehicleDialog(false);
      toast.success("Vehicle created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create vehicle");
    } finally {
      setVehicleSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <CardTitle>Planner Workspace</CardTitle>
              <p className="text-sm text-muted-foreground">
                Create weekly or monthly schedules for salesmen and delivery employees using the existing duty tables.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              {state.mode === "weekly" ? "Weekly schedule mode" : "Monthly schedule mode"}
            </div>
          </div>

          <Tabs
            value={state.activeTab}
            onValueChange={(value) => setState({ ...state, activeTab: value as PlannerTab })}
            className="space-y-4"
          >
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="salesman">Salesman Planner</TabsTrigger>
              <TabsTrigger value="delivery">Delivery Planner</TabsTrigger>
            </TabsList>

            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Schedule Type</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={state.mode}
                  onChange={(e) =>
                    setState({
                      ...state,
                      mode: e.target.value as PlannerMode,
                      anchorDate: e.target.value === "weekly" ? startOfWeek(state.anchorDate) : state.anchorDate,
                    })
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>{state.mode === "weekly" ? "Week Start" : "Month Anchor"}</Label>
                <Input
                  type="date"
                  value={normalizedAnchorDate}
                  onChange={(e) =>
                    setState({
                      ...state,
                      anchorDate: state.mode === "weekly" ? startOfWeek(e.target.value) : e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Selected Plan</Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={selectedPlanId}
                  onChange={(e) =>
                    setState({
                      ...state,
                      selectedSalesmanPlanId: state.activeTab === "salesman" ? e.target.value : state.selectedSalesmanPlanId,
                      selectedDeliveryPlanId: state.activeTab === "delivery" ? e.target.value : state.selectedDeliveryPlanId,
                    })
                  }
                >
                  <option value="">Select plan</option>
                  {planOptions.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.plan_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => void createPlan()} disabled={planCreating || plansLoading}>
                  {planCreating ? "Creating..." : "Create Plan"}
                </Button>
                <Button variant="outline" onClick={() => void deletePlan()} disabled={!selectedPlanId || planDeleting}>
                  {planDeleting ? "Deleting..." : "Delete Plan"}
                </Button>
              </div>
            </div>

            {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}

            <TabsContent value="salesman" className="space-y-4">
              {(salesmanMissingEmployees || salesmanMissingRoutes) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {salesmanMissingEmployees ? (
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Missing Salesmen</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Add employees with role `SALESMAN` before assigning routes in the planner.
                        </p>
                        <Button asChild variant="outline">
                          <Link href="/employees">Open Employees Module</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}
                  {salesmanMissingRoutes ? (
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Missing Routes</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Routes are required for salesman planning. Create areas first, then create routes mapped to those areas.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="outline">
                            <Link href="/areas">Open Areas Module</Link>
                          </Button>
                          <Button asChild>
                            <Link href="/routes">Open Routes Module</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              )}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Salesman Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mastersLoading || plansLoading || assignmentsLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : !state.selectedSalesmanPlanId ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      Create or select a salesman plan to start scheduling.
                    </div>
                  ) : salesmanOptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No sales employees found. Add employees with role `SALESMAN` first.
                    </div>
                  ) : routes.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No routes found. Add routes first.
                    </div>
                  ) : deliveryEmployeeOptions.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No delivery employees found. Add employees with role `DELIVERY_EMPLOYEE` first.
                    </div>
                  ) : vehicles.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      No delivery vehicles found. Add vehicles first.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-28">Date</TableHead>
                              <TableHead className="min-w-28">Day</TableHead>
                              {salesmanOptions.map((employee) => (
                                <TableHead key={employee.id} className="min-w-44">
                                  {employee.full_name}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleDates.map((dutyDate) => (
                              <TableRow key={dutyDate} className="align-top">
                                <TableCell className="font-medium">{dutyDate}</TableCell>
                                <TableCell>{formatDayLabel(dutyDate)}</TableCell>
                                {salesmanOptions.map((employee) => {
                                  const assignment = salesmanAssignmentMap.get(`${dutyDate}::${employee.id}`);
                                  const cellSaving = savingCellKey === `salesman::${dutyDate}::${employee.id}`;
                                  return (
                                    <TableCell key={`${dutyDate}-${employee.id}`}>
                                      <select
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={assignment?.route_id ?? ""}
                                        onChange={(e) => void handleSalesmanRouteChange(dutyDate, employee.id, e.target.value)}
                                        disabled={cellSaving}
                                      >
                                        <option value="">Unassigned</option>
                                        {routes.map((route) => (
                                          <option key={route.id} value={route.id}>
                                            {route.route_name}
                                          </option>
                                        ))}
                                      </select>
                                    </TableCell>
                                  );
                                })}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="delivery" className="space-y-4">
              {(deliveryMissingEmployees || deliveryMissingVehicles) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {deliveryMissingEmployees ? (
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Missing Delivery Employees</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Add employees with role `DELIVERY_EMPLOYEE` before planning driver, in-vehicle, bill manager, and loading duties.
                        </p>
                        <Button asChild variant="outline">
                          <Link href="/employees">Open Employees Module</Link>
                        </Button>
                      </CardContent>
                    </Card>
                  ) : null}
                  {deliveryMissingVehicles ? (
                    <Card className="border-dashed">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Missing Vehicles</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Delivery planning needs vehicles. Add a vehicle here and it will immediately appear in the planner.
                        </p>
                        <div className="flex gap-2">
                          <Dialog open={openVehicleDialog} onOpenChange={setOpenVehicleDialog}>
                            <DialogTrigger asChild>
                              <Button variant="outline">Quick Add Vehicle</Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-xl">
                              <DialogHeader>
                                <DialogTitle>Create Vehicle</DialogTitle>
                                <DialogDescription>Add a delivery vehicle for planner assignments.</DialogDescription>
                              </DialogHeader>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2 sm:col-span-2">
                                  <Label htmlFor="planner-registration-no">Registration No *</Label>
                                  <Input
                                    id="planner-registration-no"
                                    value={vehicleForm.registration_no}
                                    onChange={(e) => setVehicleForm((prev) => ({ ...prev, registration_no: e.target.value }))}
                                    placeholder="AP39AB1234"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="planner-vehicle-name">Vehicle Name</Label>
                                  <Input
                                    id="planner-vehicle-name"
                                    value={vehicleForm.vehicle_name}
                                    onChange={(e) => setVehicleForm((prev) => ({ ...prev, vehicle_name: e.target.value }))}
                                    placeholder="Leyland & Auto"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="planner-capacity-kg">Capacity Kg</Label>
                                  <Input
                                    id="planner-capacity-kg"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={vehicleForm.capacity_kg}
                                    onChange={(e) => setVehicleForm((prev) => ({ ...prev, capacity_kg: e.target.value }))}
                                    placeholder="1200"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  onClick={() => void createVehicleInline()}
                                  disabled={vehicleSubmitting || !vehicleForm.registration_no.trim()}
                                >
                                  {vehicleSubmitting ? "Creating..." : "Create Vehicle"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          <Button asChild variant="outline">
                            <Link href="/vehicles">Open Vehicles Module</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
              )}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle>Delivery Schedule</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {mastersLoading || plansLoading || assignmentsLoading ? (
                    <div className="space-y-3">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : !state.selectedDeliveryPlanId ? (
                    <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                      Create or select a delivery plan to start scheduling.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="min-w-28">Date</TableHead>
                              <TableHead className="min-w-28">Day</TableHead>
                              <TableHead className="min-w-44">Delivery Vehicle</TableHead>
                              <TableHead className="min-w-44">Driver</TableHead>
                              <TableHead className="min-w-44">In Vehicle</TableHead>
                              <TableHead className="min-w-44">Bill Manager</TableHead>
                              <TableHead className="min-w-44">Loading By</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {visibleDates.map((dutyDate) => {
                              const assignment = deliveryAssignmentMap.get(dutyDate);
                              return (
                                <TableRow key={dutyDate} className="align-top">
                                  <TableCell className="font-medium">{dutyDate}</TableCell>
                                  <TableCell>{formatDayLabel(dutyDate)}</TableCell>
                                  <TableCell>
                                    <select
                                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                      value={assignment?.vehicle_id ?? ""}
                                      onChange={(e) => void handleDeliveryFieldChange(dutyDate, "vehicle_id", e.target.value)}
                                      disabled={savingCellKey === `delivery::${dutyDate}::vehicle_id`}
                                    >
                                      <option value="">Unassigned</option>
                                      {vehicles.map((vehicle) => (
                                        <option key={vehicle.id} value={vehicle.id}>
                                          {vehicle.vehicle_name ? `${vehicle.vehicle_name} | ${vehicle.registration_no}` : vehicle.registration_no}
                                        </option>
                                      ))}
                                    </select>
                                  </TableCell>
                                  {(["driver_id", "helper_id", "bill_manager_id", "loader_id"] as const).map((field) => (
                                    <TableCell key={`${dutyDate}-${field}`}>
                                      <select
                                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                        value={assignment?.[field] ?? ""}
                                        onChange={(e) => void handleDeliveryFieldChange(dutyDate, field, e.target.value)}
                                        disabled={savingCellKey === `delivery::${dutyDate}::${field}`}
                                      >
                                        <option value="">Unassigned</option>
                                        {deliveryEmployeeOptions.map((employee) => (
                                          <option key={employee.id} value={employee.id}>
                                            {employeeLabel(employee)}
                                          </option>
                                        ))}
                                      </select>
                                    </TableCell>
                                  ))}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Visible Days</p>
            <p className="mt-2 text-2xl font-semibold">{visibleDates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Salesmen</p>
            <p className="mt-2 text-2xl font-semibold">{salesmanOptions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Delivery Employees</p>
            <p className="mt-2 text-2xl font-semibold">{deliveryEmployeeOptions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Vehicles</p>
            <p className="mt-2 text-2xl font-semibold">{vehicles.length}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
