"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, patchBackend, postBackend } from "@/lib/backend-api";
import { usePersistedPage } from "@/lib/state/pagination-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type VehicleRow = {
  id: string;
  registration_no: string;
  vehicle_name: string;
  capacity_kg: string;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 50;
const EMPTY_CREATE_FORM = {
  registration_no: "",
  vehicle_name: "",
  capacity_kg: "",
};

function mapVehicle(row: Record<string, unknown>): VehicleRow {
  return {
    id: String(row.id ?? ""),
    registration_no: String(row.registration_no ?? ""),
    vehicle_name: String(row.vehicle_name ?? ""),
    capacity_kg: String(row.capacity_kg ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

export function VehiclesAdminEditor() {
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "vehicles-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  async function load(page: number, searchText: string, pageSizeValue = pageSize) {
    setLoading(true);
    setRows([]);
    setFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSizeValue));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/masters/vehicles?${params.toString()}`));
      setRows(asArray(response.items).map(mapVehicle));
      setCurrentPage(Number(response.page ?? page));
      setTotalPages(Number(response.total_pages ?? 0));
      setTotalCount(Number(response.total ?? 0));
      setSelectedIds([]);
      setOpenId(null);
    } catch (error) {
      setRows([]);
      resetPage();
      setTotalPages(0);
      setTotalCount(0);
      const message = `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize]);

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  function updateSelected(field: keyof VehicleRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function createVehicle() {
    if (!createForm.registration_no.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/vehicles", {
        registration_no: createForm.registration_no.trim(),
        vehicle_name: createForm.vehicle_name.trim() || null,
        capacity_kg: createForm.capacity_kg.trim() ? Number(createForm.capacity_kg) : null,
      });
      const createdName = createForm.registration_no.trim();
      setCreateForm({ ...EMPTY_CREATE_FORM });
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success(`Vehicle created: ${createdName}`, { duration: 5000 });
      setFeedback(`Vehicle created: ${createdName}`);
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function saveSelected() {
    if (!selected) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/vehicles/${selected.id}`, {
        registration_no: selected.registration_no.trim(),
        vehicle_name: selected.vehicle_name.trim() || null,
        capacity_kg: selected.capacity_kg.trim() ? Number(selected.capacity_kg) : null,
        is_active: selected.is_active,
      });
      toast.success(`Vehicle updated: ${selected.registration_no}`, { duration: 5000 });
      setFeedback(`Vehicle updated: ${selected.registration_no}`);
      setOpenId(null);
      await load(currentPage, search, pageSize);
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || loading) {
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.length} selected vehicle(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/vehicles/${id}`)));
      toast.success(`Deleted ${selectedIds.length} vehicle(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} vehicle(s).`);
      await load(currentPage, search, pageSize);
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vehicles (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search registration or vehicle name"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (value.trim() === "" && search !== "") {
                setSearch("");
                resetPage();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput.trim());
                resetPage();
              }
            }}
          />
          <Button
            onClick={() => {
              setSearch(searchInput.trim());
              resetPage();
            }}
            disabled={loading}
          >
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput("");
              setSearch("");
              resetPage();
            }}
          >
            Reset
          </Button>
          <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
            Delete Selected
          </Button>
          <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
            <DialogTrigger asChild>
              <Button>Add Vehicle</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Vehicle</DialogTitle>
                <DialogDescription>Create a vehicle for delivery planning.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Registration No *</Label>
                  <Input
                    value={createForm.registration_no}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, registration_no: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Vehicle Name</Label>
                  <Input
                    value={createForm.vehicle_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, vehicle_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Capacity Kg</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={createForm.capacity_kg}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, capacity_kg: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createVehicle} disabled={creating || !createForm.registration_no.trim()}>
                  {creating ? "Creating..." : "Create Vehicle"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Registration</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Vehicle Name</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Capacity Kg</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Active</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 12 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No vehicles found.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                rows.map((row, index) => (
                  <TableRow key={row.id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => toggleSelectOne(row.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>{row.registration_no}</TableCell>
                    <TableCell>{row.vehicle_name || "-"}</TableCell>
                    <TableCell>{row.capacity_kg || "-"}</TableCell>
                    <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit Vehicle</DialogTitle>
                            <DialogDescription>Update vehicle fields and save.</DialogDescription>
                          </DialogHeader>
                          {selected ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 md:col-span-2">
                                <Label>Registration No</Label>
                                <Input
                                  value={selected.registration_no}
                                  onChange={(e) => updateSelected("registration_no", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Vehicle Name</Label>
                                <Input value={selected.vehicle_name} onChange={(e) => updateSelected("vehicle_name", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Capacity Kg</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={selected.capacity_kg}
                                  onChange={(e) => updateSelected("capacity_kg", e.target.value)}
                                />
                              </div>
                            </div>
                          ) : null}
                          <DialogFooter>
                            <Button onClick={saveSelected} disabled={!selected || savingId === selected.id}>
                              {savingId === selected?.id ? "Saving..." : "Save"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        <PaginationFooter
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            resetPage();
          }}
        />
      </CardContent>
    </Card>
  );
}
