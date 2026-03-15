"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, patchBackend, postBackend } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ModuleOption = { module_name: string; label: string };
type RoleMatrix = Record<string, { read: boolean; write: boolean }>;
type WarehouseOption = { id: string; name: string };
type AdminUserRow = {
  employee_id: string;
  full_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  warehouse_id: string;
  warehouse_name: string;
  username: string;
  role_id: string;
  role_name: string;
  permissions: RoleMatrix;
  is_active: boolean;
  is_super_admin: boolean;
};

const ADMIN_MODULES: ModuleOption[] = [
  { module_name: "dashboard", label: "Dashboard" },
  { module_name: "purchase", label: "Purchase Module" },
  { module_name: "stock", label: "Stock Module" },
  { module_name: "products", label: "Products" },
  { module_name: "warehouses", label: "Warehouse Module" },
  { module_name: "sales", label: "Sales Module" },
  { module_name: "sales-invoices", label: "Sales Invoices" },
  { module_name: "planning", label: "Planner Module" },
  { module_name: "areas", label: "Areas Module" },
  { module_name: "routes", label: "Routes Module" },
  { module_name: "vehicles", label: "Vehicles Module" },
  { module_name: "schemes", label: "Schemes Module" },
  { module_name: "price", label: "Price Module" },
  { module_name: "credit-debit-notes", label: "Credit Debit Notes" },
  { module_name: "customers", label: "Customers Module" },
  { module_name: "employees", label: "Employees Module" },
  { module_name: "vendors", label: "Vendor Module" },
  { module_name: "delivery", label: "Delivery Workflow" },
];

const EMPTY_ADMIN_FORM = {
  full_name: "",
  phone: "",
  alternate_phone: "",
  email: "",
  username: "",
  password: "",
  warehouse_id: "",
  permissions: emptyMatrix(ADMIN_MODULES),
};

function emptyMatrix(modules: ModuleOption[]): RoleMatrix {
  return Object.fromEntries(modules.map((module) => [module.module_name, { read: false, write: false }]));
}

export function AdminAccessEditor() {
  const [admins, setAdmins] = useState<AdminUserRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdminDialog, setOpenAdminDialog] = useState(false);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState({ ...EMPTY_ADMIN_FORM });

  async function loadAll() {
    setLoading(true);
    try {
      const [adminsRes, warehousesRes] = await Promise.all([
        fetchBackend("/masters/admin-users"),
        fetchBackend("/masters/warehouses?page=1&page_size=100"),
      ]);
      setAdmins(
        asArray(asObject(adminsRes).items).map((item) => ({
          employee_id: String(item.employee_id ?? ""),
          full_name: String(item.full_name ?? ""),
          phone: String(item.phone ?? ""),
          alternate_phone: String(item.alternate_phone ?? ""),
          email: String(item.email ?? ""),
          warehouse_id: String(item.warehouse_id ?? ""),
          warehouse_name: String(item.warehouse_name ?? ""),
          username: String(item.username ?? ""),
          role_id: String(item.role_id ?? ""),
          role_name: String(item.role_name ?? ""),
          permissions: asObject(item.permissions) as RoleMatrix,
          is_active: Boolean(item.is_active),
          is_super_admin: Boolean(item.is_super_admin),
        }))
      );
      setWarehouses(
        asArray(asObject(warehousesRes).items).map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
        }))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load admin access");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!adminForm.warehouse_id && warehouses.length > 0) {
      setAdminForm((prev) => ({ ...prev, warehouse_id: warehouses[0].id }));
    }
  }, [adminForm.warehouse_id, warehouses]);

  function resetAdminDialog() {
    setEditingAdminId(null);
    setAdminForm({
      ...EMPTY_ADMIN_FORM,
      warehouse_id: warehouses[0]?.id ?? "",
      permissions: emptyMatrix(ADMIN_MODULES),
    });
  }

  function togglePermission(moduleName: string, key: "read" | "write", checked: boolean) {
    setAdminForm((prev) => {
      const next = { ...prev };
      const permissions = { ...next.permissions };
      const current = permissions[moduleName] ?? { read: false, write: false };
      if (key === "write") {
        permissions[moduleName] = { read: checked ? true : current.read, write: checked };
      } else {
        permissions[moduleName] = { read: checked, write: checked ? current.write : false };
      }
      next.permissions = permissions;
      return next;
    });
  }

  function openEditAdmin(admin: AdminUserRow) {
    setEditingAdminId(admin.employee_id);
    setAdminForm({
      full_name: admin.full_name,
      phone: admin.phone,
      alternate_phone: admin.alternate_phone,
      email: admin.email,
      username: admin.username,
      password: "",
      warehouse_id: admin.warehouse_id,
      permissions: { ...emptyMatrix(ADMIN_MODULES), ...admin.permissions },
    });
    setOpenAdminDialog(true);
  }

  async function saveAdmin() {
    if (!adminForm.full_name.trim() || !adminForm.phone.trim() || !adminForm.warehouse_id) {
      toast.error("Full name, phone, and warehouse are required");
      return;
    }
    setSavingAdmin(true);
    try {
      const payload = {
        full_name: adminForm.full_name.trim(),
        phone: adminForm.phone.trim(),
        alternate_phone: adminForm.alternate_phone.trim() || null,
        email: adminForm.email.trim() || null,
        username: adminForm.username.trim() || null,
        password: adminForm.password.trim() || null,
        warehouse_id: adminForm.warehouse_id,
        permissions: adminForm.permissions,
      };
      if (editingAdminId) {
        await patchBackend(`/masters/admin-users/${editingAdminId}`, payload);
        toast.success(`Admin updated: ${adminForm.full_name.trim()}`);
      } else {
        await postBackend("/masters/admin-users", payload);
        toast.success(`Admin created: ${adminForm.full_name.trim()}`);
      }
      setOpenAdminDialog(false);
      resetAdminDialog();
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save admin");
    } finally {
      setSavingAdmin(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Admin Access</h2>
        <p className="text-sm text-muted-foreground">Super admin manages normal admin roles and module-level read/write access from here.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Normal Admins</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{admins.filter((item) => !item.is_super_admin).length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Visible Modules</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{ADMIN_MODULES.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Super Admins</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{admins.filter((item) => item.is_super_admin).length}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Admin Users</CardTitle>
            <Dialog
              open={openAdminDialog}
              onOpenChange={(open) => {
                setOpenAdminDialog(open);
                if (!open) resetAdminDialog();
              }}
            >
              <DialogTrigger asChild>
                <Button>Create Admin</Button>
              </DialogTrigger>
              <DialogContent className="flex max-h-[90vh] w-[min(95vw,56rem)] flex-col overflow-hidden sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingAdminId ? "Edit Admin" : "Create Admin"}</DialogTitle>
                  <DialogDescription>Super admin decides each admin access directly here.</DialogDescription>
                </DialogHeader>
                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Full Name *</Label>
                      <Input value={adminForm.full_name} onChange={(e) => setAdminForm((prev) => ({ ...prev, full_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Phone *</Label>
                      <Input value={adminForm.phone} onChange={(e) => setAdminForm((prev) => ({ ...prev, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Username</Label>
                      <Input value={adminForm.username} onChange={(e) => setAdminForm((prev) => ({ ...prev, username: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Password</Label>
                      <Input type="password" value={adminForm.password} onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input value={adminForm.email} onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Alternate Phone</Label>
                      <Input
                        value={adminForm.alternate_phone}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, alternate_phone: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Warehouse *</Label>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={adminForm.warehouse_id}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, warehouse_id: e.target.value }))}
                      >
                        <option value="">Select warehouse</option>
                        {warehouses.map((warehouse) => (
                          <option key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Module</TableHead>
                          <TableHead className="w-24">Read</TableHead>
                          <TableHead className="w-24">Write</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ADMIN_MODULES.map((module) => {
                          const access = adminForm.permissions[module.module_name] ?? { read: false, write: false };
                          return (
                            <TableRow key={module.module_name}>
                              <TableCell>{module.label}</TableCell>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={access.read}
                                  onChange={(e) => togglePermission(module.module_name, "read", e.target.checked)}
                                />
                              </TableCell>
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={access.write}
                                  onChange={(e) => togglePermission(module.module_name, "write", e.target.checked)}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <DialogFooter className="mt-2 border-t pt-4">
                  <Button onClick={() => void saveAdmin()} disabled={savingAdmin}>
                    {savingAdmin ? "Saving..." : editingAdminId ? "Save Admin" : "Create Admin"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? null : admins.map((admin) => (
                  <TableRow key={admin.employee_id}>
                    <TableCell>{admin.full_name}{admin.is_super_admin ? " (Super Admin)" : ""}</TableCell>
                    <TableCell>{admin.username || "-"}</TableCell>
                    <TableCell>{admin.warehouse_name || "-"}</TableCell>
                    <TableCell>{admin.is_super_admin ? "All" : Object.values(admin.permissions).filter((entry) => entry.read || entry.write).length}</TableCell>
                    <TableCell>
                      {admin.is_super_admin ? (
                        <span className="text-xs text-muted-foreground">Managed by migration</span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => openEditAdmin(admin)}>
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
