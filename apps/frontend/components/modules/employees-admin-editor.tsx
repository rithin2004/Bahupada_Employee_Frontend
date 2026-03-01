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

type EmployeeRole =
  | "ADMIN"
  | "PACKER"
  | "SUPERVISOR"
  | "SALESMAN"
  | "DELIVERY_EMPLOYEE"
  | "DRIVER"
  | "IN_VEHICLE_HELPER"
  | "BILL_MANAGER"
  | "LOADER";
type Gender = "MALE" | "FEMALE" | "OTHER" | "";

type EmployeeRow = {
  id: string;
  full_name: string;
  role: EmployeeRole;
  role_id: string;
  username: string;
  password: string;
  sub_role_name: string;
  gender: Gender;
  phone: string;
  alternate_phone: string;
  email: string;
  warehouse_id: string;
  warehouse_name: string;
  is_active: boolean;
  dob: string;
  aadhaar_hash: string;
  pan_number: string;
  driver_license_no: string;
  driver_license_expiry: string;
};

type WarehouseOption = { id: string; name: string };
type RoleOption = { id: string; role_name: string };

const DEFAULT_PAGE_SIZE = 50;

const EMPTY_CREATE_FORM = {
  full_name: "",
  role: "SALESMAN" as EmployeeRole,
  role_id: "",
  username: "",
  password: "",
  gender: "" as Gender,
  phone: "",
  alternate_phone: "",
  email: "",
  warehouse_id: "",
  dob: "",
  aadhaar_hash: "",
  pan_number: "",
  driver_license_no: "",
  driver_license_expiry: "",
};

function mapRow(row: Record<string, unknown>): EmployeeRow {
  return {
    id: String(row.id ?? ""),
    full_name: String(row.full_name ?? ""),
    role: String(row.role ?? "SALESMAN") as EmployeeRole,
    role_id: String(row.role_id ?? ""),
    username: String(row.username ?? ""),
    password: "",
    sub_role_name: String(row.sub_role_name ?? ""),
    gender: (String(row.gender ?? "") as Gender) || "",
    phone: String(row.phone ?? ""),
    alternate_phone: String(row.alternate_phone ?? ""),
    email: String(row.email ?? ""),
    warehouse_id: String(row.warehouse_id ?? ""),
    warehouse_name: String(row.warehouse_name ?? ""),
    is_active: Boolean(row.is_active ?? true),
    dob: String(row.dob ?? ""),
    aadhaar_hash: String(row.aadhaar_hash ?? ""),
    pan_number: String(row.pan_number ?? ""),
    driver_license_no: String(row.driver_license_no ?? ""),
    driver_license_expiry: String(row.driver_license_expiry ?? ""),
  };
}

export function EmployeesAdminEditor() {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "employees-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  async function loadReferenceData() {
    try {
      const [whRes, roleRes] = await Promise.all([
        fetchBackend("/masters/warehouses?page=1&page_size=100"),
        fetchBackend("/masters/roles?page=1&page_size=100"),
      ]);
      setWarehouses(
        asArray(asObject(whRes).items).map((row) => ({
          id: String(row.id ?? ""),
          name: String(row.name ?? ""),
        }))
      );
      setRoles(
        asArray(asObject(roleRes).items).map((row) => ({
          id: String(row.id ?? ""),
          role_name: String(row.role_name ?? ""),
        }))
      );
    } catch {
      setWarehouses([]);
      setRoles([]);
    }
  }

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
      const response = asObject(await fetchBackend(`/masters/employees?${params.toString()}`));
      setRows(asArray(response.items).map(mapRow));
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
    void loadReferenceData();
  }, []);

  useEffect(() => {
    if (!createForm.warehouse_id && warehouses.length > 0) {
      setCreateForm((prev) => ({ ...prev, warehouse_id: prev.warehouse_id || warehouses[0].id }));
    }
  }, [createForm.warehouse_id, warehouses]);

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

  function updateSelected(field: keyof EmployeeRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function saveSelected() {
    if (!selected) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/employees/${selected.id}`, {
        warehouse_id: selected.warehouse_id,
        full_name: selected.full_name.trim(),
        role: selected.role,
        role_id: selected.role_id || null,
        username: selected.username.trim() || null,
        password: selected.password.trim() || null,
        phone: selected.phone.trim(),
        dob: selected.dob || null,
        gender: selected.gender || null,
        alternate_phone: selected.alternate_phone.trim() || null,
        email: selected.email.trim() || null,
        aadhaar_hash: selected.aadhaar_hash.trim() || null,
        pan_number: selected.pan_number.trim() || null,
        driver_license_no: selected.driver_license_no.trim() || null,
        driver_license_expiry: selected.driver_license_expiry || null,
        is_active: selected.is_active,
      });
      toast.success(`Employee updated: ${selected.full_name}`, { duration: 5000 });
      setFeedback(`Employee updated: ${selected.full_name}`);
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

  async function createEmployee() {
    if (!createForm.full_name.trim() || !createForm.phone.trim() || !createForm.warehouse_id) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/employees", {
        warehouse_id: createForm.warehouse_id,
        full_name: createForm.full_name.trim(),
        role: createForm.role,
        phone: createForm.phone.trim(),
        username: createForm.username.trim() || null,
        password: createForm.password.trim() || null,
        role_id: createForm.role_id || null,
        dob: createForm.dob || null,
        gender: createForm.gender || null,
        alternate_phone: createForm.alternate_phone.trim() || null,
        email: createForm.email.trim() || null,
        aadhaar_hash: createForm.aadhaar_hash.trim() || null,
        pan_number: createForm.pan_number.trim() || null,
        driver_license_no: createForm.driver_license_no.trim() || null,
        driver_license_expiry: createForm.driver_license_expiry || null,
      });
      const createdName = createForm.full_name.trim();
      setCreateForm({
        ...EMPTY_CREATE_FORM,
        warehouse_id: warehouses[0]?.id ?? "",
      });
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success(`Employee created: ${createdName}`, { duration: 5000 });
      setFeedback(`Employee created: ${createdName}`);
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || loading) {
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.length} selected employee(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/employees/${id}`)));
      toast.success(`Deleted ${selectedIds.length} employee(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} employee(s).`);
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
        <CardTitle>Employees (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search name, phone, role, warehouse"
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
              <Button>Add Employee</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
                <DialogDescription>Create an employee using the `EmployeeCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Full Name *</Label>
                  <Input
                    value={createForm.full_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone *</Label>
                  <Input value={createForm.phone} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input
                    value={createForm.username}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))}
                    placeholder="Auto-generated if empty"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Defaults to ChangeMe@123"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role *</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.role}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value as EmployeeRole }))}
                  >
                    {[
                      "ADMIN",
                      "SALESMAN",
                      "DELIVERY_EMPLOYEE",
                      "PACKER",
                      "SUPERVISOR",
                      "DRIVER",
                      "IN_VEHICLE_HELPER",
                      "BILL_MANAGER",
                      "LOADER",
                    ].map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Sub Role (Optional)</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.role_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, role_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.role_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Warehouse *</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.warehouse_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, warehouse_id: e.target.value }))}
                  >
                    <option value="">{warehouses.length ? "Select warehouse" : "No warehouses found"}</option>
                    {warehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Gender</Label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={createForm.gender}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, gender: e.target.value as Gender }))}
                  >
                    <option value="">Unset</option>
                    <option value="MALE">MALE</option>
                    <option value="FEMALE">FEMALE</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Date of Birth</Label>
                  <Input type="date" value={createForm.dob} onChange={(e) => setCreateForm((prev) => ({ ...prev, dob: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Alternate Phone</Label>
                  <Input
                    value={createForm.alternate_phone}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, alternate_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Aadhaar Hash</Label>
                  <Input
                    value={createForm.aadhaar_hash}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, aadhaar_hash: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>PAN Number</Label>
                  <Input
                    value={createForm.pan_number}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, pan_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Driver License No</Label>
                  <Input
                    value={createForm.driver_license_no}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, driver_license_no: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Driver License Expiry</Label>
                  <Input
                    type="date"
                    value={createForm.driver_license_expiry}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, driver_license_expiry: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={createEmployee}
                  disabled={
                    creating ||
                    !createForm.full_name.trim() ||
                    !createForm.phone.trim() ||
                    !createForm.warehouse_id
                  }
                >
                  {creating ? "Creating..." : "Create Employee"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Name</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Role</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Sub Role</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Gender</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Phone</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Warehouse</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Active</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 10 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No employees found.
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
                    <TableCell>{row.full_name}</TableCell>
                    <TableCell>{row.role}</TableCell>
                    <TableCell>{row.sub_role_name || "-"}</TableCell>
                    <TableCell>{row.gender || "-"}</TableCell>
                    <TableCell>{row.phone || "-"}</TableCell>
                    <TableCell>{row.warehouse_name || "-"}</TableCell>
                    <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-h-[85vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Edit Employee</DialogTitle>
                            <DialogDescription>Update employee fields and save.</DialogDescription>
                          </DialogHeader>
                          {selected ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label>Full Name</Label>
                                <Input value={selected.full_name} onChange={(e) => updateSelected("full_name", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Phone</Label>
                                <Input value={selected.phone} onChange={(e) => updateSelected("phone", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Username</Label>
                                <Input
                                  value={selected.username}
                                  onChange={(e) => updateSelected("username", e.target.value)}
                                  placeholder="Auto-generated if empty"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>New Password</Label>
                                <Input
                                  type="password"
                                  value={selected.password}
                                  onChange={(e) => updateSelected("password", e.target.value)}
                                  placeholder="Leave blank to keep current password"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Role</Label>
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={selected.role}
                                  onChange={(e) => updateSelected("role", e.target.value as EmployeeRole)}
                                >
                                  {[
                                    "ADMIN",
                                    "SALESMAN",
                                    "DELIVERY_EMPLOYEE",
                                    "PACKER",
                                    "SUPERVISOR",
                                    "DRIVER",
                                    "IN_VEHICLE_HELPER",
                                    "BILL_MANAGER",
                                    "LOADER",
                                  ].map((role) => (
                                    <option key={role} value={role}>
                                      {role}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>Sub Role (Optional)</Label>
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={selected.role_id}
                                  onChange={(e) => updateSelected("role_id", e.target.value)}
                                >
                                  <option value="">None</option>
                                  {roles.map((role) => (
                                    <option key={role.id} value={role.id}>
                                      {role.role_name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>Warehouse</Label>
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={selected.warehouse_id}
                                  onChange={(e) => updateSelected("warehouse_id", e.target.value)}
                                >
                                  {warehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                      {warehouse.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>Gender</Label>
                                <select
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={selected.gender}
                                  onChange={(e) => updateSelected("gender", e.target.value as Gender)}
                                >
                                  <option value="">Unset</option>
                                  <option value="MALE">MALE</option>
                                  <option value="FEMALE">FEMALE</option>
                                  <option value="OTHER">OTHER</option>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>Date of Birth</Label>
                                <Input type="date" value={selected.dob} onChange={(e) => updateSelected("dob", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Alternate Phone</Label>
                                <Input
                                  value={selected.alternate_phone}
                                  onChange={(e) => updateSelected("alternate_phone", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Email</Label>
                                <Input value={selected.email} onChange={(e) => updateSelected("email", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Aadhaar Hash</Label>
                                <Input
                                  value={selected.aadhaar_hash}
                                  onChange={(e) => updateSelected("aadhaar_hash", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>PAN Number</Label>
                                <Input value={selected.pan_number} onChange={(e) => updateSelected("pan_number", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Driver License No</Label>
                                <Input
                                  value={selected.driver_license_no}
                                  onChange={(e) => updateSelected("driver_license_no", e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <Label>Driver License Expiry</Label>
                                <Input
                                  type="date"
                                  value={selected.driver_license_expiry}
                                  onChange={(e) => updateSelected("driver_license_expiry", e.target.value)}
                                />
                              </div>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={selected.is_active}
                                  onChange={(e) => updateSelected("is_active", e.target.checked)}
                                />
                                Active
                              </label>
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
          loading={loading}
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          pageSize={pageSize}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setCurrentPage(1);
          }}
          onFirst={() => setCurrentPage(1)}
          onPrevious={() => setCurrentPage((p) => p - 1)}
          onNext={() => setCurrentPage((p) => p + 1)}
          onLast={() => setCurrentPage(totalPages)}
        />
      </CardContent>
    </Card>
  );
}
