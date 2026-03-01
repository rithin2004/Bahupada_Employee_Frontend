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

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 50;

export function WarehousesAdminEditor() {
  const [rows, setRows] = useState<WarehouseRow[]>([]);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "warehouses-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    street: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
  });

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  async function load(page: number, pageSizeValue = pageSize) {
    setLoading(true);
    setFeedback("");
    try {
      const res = asObject(await fetchBackend(`/masters/warehouses?page=${page}&page_size=${pageSizeValue}`));
      setRows(
        asArray(res.items).map((row) => ({
          id: String(row.id ?? ""),
          code: String(row.code ?? ""),
          name: String(row.name ?? ""),
          street: String(row.street ?? ""),
          city: String(row.city ?? ""),
          state: String(row.state ?? ""),
          pincode: String(row.pincode ?? ""),
          latitude: row.latitude == null ? "" : String(row.latitude),
          longitude: row.longitude == null ? "" : String(row.longitude),
          is_active: Boolean(row.is_active ?? true),
        }))
      );
      setCurrentPage(Number(res.page ?? page));
      setTotalPages(Number(res.total_pages ?? 0));
      setTotalCount(Number(res.total ?? 0));
      setSelectedIds([]);
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
    void load(currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize]);

  async function createWarehouse() {
    if (!form.code.trim() || !form.name.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/warehouses", {
        code: form.code.trim(),
        name: form.name.trim(),
        street: form.street.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        latitude: form.latitude.trim() ? Number(form.latitude) : null,
        longitude: form.longitude.trim() ? Number(form.longitude) : null,
      });
      setForm({
        code: "",
        name: "",
        street: "",
        city: "",
        state: "",
        pincode: "",
        latitude: "",
        longitude: "",
      });
      toast.success("Warehouse created.", { duration: 5000 });
      setFeedback("Warehouse created.");
      setOpenAddDialog(false);
      resetPage();
      await load(1, pageSize);
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  function updateSelected(field: keyof WarehouseRow, value: string | boolean) {
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
      await patchBackend(`/masters/warehouses/${selected.id}`, {
        code: selected.code.trim(),
        name: selected.name.trim(),
        street: selected.street.trim() || null,
        city: selected.city.trim() || null,
        state: selected.state.trim() || null,
        pincode: selected.pincode.trim() || null,
        latitude: selected.latitude.trim() ? Number(selected.latitude) : null,
        longitude: selected.longitude.trim() ? Number(selected.longitude) : null,
        is_active: selected.is_active,
      });
      toast.success(`Warehouse updated: ${selected.code || selected.name}`, { duration: 5000 });
      setFeedback(`Warehouse updated: ${selected.code || selected.name}`);
      setOpenId(null);
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
    if (!window.confirm(`Delete ${selectedIds.length} selected warehouse(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/warehouses/${id}`)));
      toast.success(`Deleted ${selectedIds.length} warehouse(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} warehouse(s).`);
      await load(currentPage, pageSize);
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Warehouses</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
              Delete Selected
            </Button>
            <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
              <DialogTrigger asChild>
                <Button>Add Warehouse</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add Warehouse</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Code *</Label>
                    <Input value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Street</Label>
                    <Input value={form.street} onChange={(e) => setForm((prev) => ({ ...prev, street: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>City</Label>
                    <Input value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>State</Label>
                    <Input value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Pincode</Label>
                    <Input value={form.pincode} onChange={(e) => setForm((prev) => ({ ...prev, pincode: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input value={form.latitude} onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input value={form.longitude} onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))} />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createWarehouse} disabled={creating || !form.code.trim() || !form.name.trim()}>
                    {creating ? "Creating..." : "Create Warehouse"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[760px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>City</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-52 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-32 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-14" /></TableCell>
                </TableRow>
              ) : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No warehouses found.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(e) => toggleSelectOne(row.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.city || "-"}</TableCell>
                    <TableCell>{row.state || "-"}</TableCell>
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
                            <DialogTitle>Edit Warehouse</DialogTitle>
                            <DialogDescription>Update warehouse fields and save.</DialogDescription>
                          </DialogHeader>
                          {selected ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1">
                                <Label>Code</Label>
                                <Input value={selected.code} onChange={(e) => updateSelected("code", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Name</Label>
                                <Input value={selected.name} onChange={(e) => updateSelected("name", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Street</Label>
                                <Input value={selected.street} onChange={(e) => updateSelected("street", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>City</Label>
                                <Input value={selected.city} onChange={(e) => updateSelected("city", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>State</Label>
                                <Input value={selected.state} onChange={(e) => updateSelected("state", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Pincode</Label>
                                <Input value={selected.pincode} onChange={(e) => updateSelected("pincode", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Latitude</Label>
                                <Input value={selected.latitude} onChange={(e) => updateSelected("latitude", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Longitude</Label>
                                <Input value={selected.longitude} onChange={(e) => updateSelected("longitude", e.target.value)} />
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
                            <Button onClick={saveSelected} disabled={!selected || !selected.code.trim() || !selected.name.trim() || savingId === selected.id}>
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
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
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
