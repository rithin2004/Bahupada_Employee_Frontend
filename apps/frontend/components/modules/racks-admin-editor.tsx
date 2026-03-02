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

type WarehouseOption = { id: string; label: string };
type RackRow = {
  id: string;
  warehouse_id: string;
  rack_type: string;
  number_of_rows: number;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 50;

export function RacksAdminEditor() {
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [rows, setRows] = useState<RackRow[]>([]);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "racks-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [openWarehouseDialog, setOpenWarehouseDialog] = useState(false);
  const [creatingWarehouseInline, setCreatingWarehouseInline] = useState(false);
  const [newWarehouseCode, setNewWarehouseCode] = useState("");
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({
    warehouse_id: "",
    rack_type: "",
    number_of_rows: "1",
  });

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  async function loadWarehouses() {
    try {
      const res = asObject(await fetchBackend("/masters/warehouses?page=1&page_size=100"));
      setWarehouses(
        asArray(res.items)
          .map((row) => ({
            id: String(row.id ?? ""),
            label: `${String(row.name ?? "Warehouse")} (${String(row.code ?? "-")})`,
          }))
          .filter((row) => row.id)
      );
    } catch {
      setWarehouses([]);
    }
  }

  useEffect(() => {
    void loadWarehouses();
  }, []);

  async function load(page: number, pageSizeValue = pageSize) {
    setLoading(true);
    setFeedback("");
    try {
      const res = asObject(await fetchBackend(`/masters/racks?page=${page}&page_size=${pageSizeValue}`));
      setRows(
        asArray(res.items).map((row) => ({
          id: String(row.id ?? ""),
          warehouse_id: String(row.warehouse_id ?? ""),
          rack_type: String(row.rack_type ?? ""),
          number_of_rows: Number(row.number_of_rows ?? 1),
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

  async function createRack() {
    if (!form.warehouse_id || Number(form.number_of_rows) < 1) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/racks", {
        warehouse_id: form.warehouse_id,
        rack_type: form.rack_type.trim() || null,
        number_of_rows: Number(form.number_of_rows),
      });
      setForm({ warehouse_id: form.warehouse_id, rack_type: "", number_of_rows: "1" });
      toast.success("Rack created.", { duration: 5000 });
      setFeedback("Rack created.");
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

  async function createInlineWarehouse() {
    if (!newWarehouseCode.trim() || !newWarehouseName.trim()) {
      toast.error("Warehouse code and name are required.", { duration: 4000 });
      return;
    }

    setCreatingWarehouseInline(true);
    try {
      const created = asObject(
        await postBackend("/masters/warehouses", {
          code: newWarehouseCode.trim(),
          name: newWarehouseName.trim(),
        })
      );
      await loadWarehouses();
      setForm((prev) => ({ ...prev, warehouse_id: String(created.id ?? "") }));
      setOpenWarehouseDialog(false);
      setNewWarehouseCode("");
      setNewWarehouseName("");
      toast.success(`Warehouse added: ${String(created.name ?? newWarehouseName.trim())}`, { duration: 4000 });
    } catch (error) {
      toast.error(`Warehouse create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingWarehouseInline(false);
    }
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  function updateSelected(field: keyof RackRow, value: string | number | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function saveSelected() {
    if (!selected || !selected.warehouse_id || selected.number_of_rows < 1) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/racks/${selected.id}`, {
        warehouse_id: selected.warehouse_id,
        rack_type: selected.rack_type.trim() || null,
        number_of_rows: selected.number_of_rows,
        is_active: selected.is_active,
      });
      toast.success("Rack updated.", { duration: 5000 });
      setFeedback("Rack updated.");
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
    if (!window.confirm(`Delete ${selectedIds.length} selected rack(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/racks/${id}`)));
      toast.success(`Deleted ${selectedIds.length} rack(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} rack(s).`);
      await load(currentPage, pageSize);
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  function warehouseName(warehouseId: string) {
    return warehouses.find((w) => w.id === warehouseId)?.label ?? warehouseId;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Racks</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
              Delete Selected
            </Button>
            <Dialog open={openAddDialog} onOpenChange={setOpenAddDialog}>
              <DialogTrigger asChild>
                <Button>Add Rack</Button>
              </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Rack</DialogTitle>
                  </DialogHeader>
                <div className="grid gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Warehouse *</Label>
                      <Dialog open={openWarehouseDialog} onOpenChange={setOpenWarehouseDialog}>
                        <DialogTrigger asChild>
                          <Button size="sm" type="button" variant="outline">+ Add Warehouse</Button>
                        </DialogTrigger>
                        <DialogContent className="w-[92vw] max-w-[520px]">
                          <DialogHeader>
                            <DialogTitle>Add Warehouse</DialogTitle>
                            <DialogDescription>Create a warehouse without leaving rack creation.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Code *</Label>
                              <Input value={newWarehouseCode} onChange={(e) => setNewWarehouseCode(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Name *</Label>
                              <Input value={newWarehouseName} onChange={(e) => setNewWarehouseName(e.target.value)} />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpenWarehouseDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={createInlineWarehouse}
                              disabled={creatingWarehouseInline || !newWarehouseCode.trim() || !newWarehouseName.trim()}
                            >
                              {creatingWarehouseInline ? "Adding..." : "Add Warehouse"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <select
                      className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={form.warehouse_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, warehouse_id: e.target.value }))}
                    >
                      <option value="">{warehouses.length ? "Select warehouse" : "No warehouses found"}</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Rack Type</Label>
                    <Input value={form.rack_type} onChange={(e) => setForm((prev) => ({ ...prev, rack_type: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Number of Rows *</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.number_of_rows}
                      onChange={(e) => setForm((prev) => ({ ...prev, number_of_rows: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={createRack} disabled={creating || !form.warehouse_id || Number(form.number_of_rows) < 1}>
                    {creating ? "Creating..." : "Create Rack"}
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
                <TableHead>Warehouse</TableHead>
                <TableHead>Rack Type</TableHead>
                <TableHead>Rows</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-56 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-12 dark:h-5" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-14" /></TableCell>
                </TableRow>
              ) : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No racks found.
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
                    <TableCell>{warehouseName(row.warehouse_id)}</TableCell>
                    <TableCell>{row.rack_type || "-"}</TableCell>
                    <TableCell>{row.number_of_rows}</TableCell>
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
                            <DialogTitle>Edit Rack</DialogTitle>
                            <DialogDescription>Update rack fields and save.</DialogDescription>
                          </DialogHeader>
                          {selected ? (
                            <div className="grid gap-3">
                              <div className="space-y-1">
                                <Label>Warehouse *</Label>
                                <select
                                  className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                                  value={selected.warehouse_id}
                                  onChange={(e) => updateSelected("warehouse_id", e.target.value)}
                                >
                                  <option value="">{warehouses.length ? "Select warehouse" : "No warehouses found"}</option>
                                  {warehouses.map((warehouse) => (
                                    <option key={warehouse.id} value={warehouse.id}>
                                      {warehouse.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <Label>Rack Type</Label>
                                <Input value={selected.rack_type} onChange={(e) => updateSelected("rack_type", e.target.value)} />
                              </div>
                              <div className="space-y-1">
                                <Label>Number of Rows *</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  value={selected.number_of_rows}
                                  onChange={(e) => updateSelected("number_of_rows", Number(e.target.value))}
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
                            <Button
                              onClick={saveSelected}
                              disabled={!selected || !selected.warehouse_id || selected.number_of_rows < 1 || savingId === selected.id}
                            >
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
