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

type AreaRow = {
  id: string;
  area_name: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 50;
const EMPTY_CREATE_FORM = {
  area_name: "",
  city: "",
  state: "",
  pincode: "",
  latitude: "",
  longitude: "",
};

function mapArea(row: Record<string, unknown>): AreaRow {
  return {
    id: String(row.id ?? ""),
    area_name: String(row.area_name ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    pincode: String(row.pincode ?? ""),
    latitude: String(row.latitude ?? ""),
    longitude: String(row.longitude ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

export function AreasAdminEditor() {
  const [rows, setRows] = useState<AreaRow[]>([]);
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
    "areas-admin",
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
      const response = asObject(await fetchBackend(`/masters/areas?${params.toString()}`));
      setRows(asArray(response.items).map(mapArea));
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

  function updateSelected(field: keyof AreaRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function createArea() {
    if (!createForm.area_name.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/areas", {
        area_name: createForm.area_name.trim(),
        city: createForm.city.trim() || null,
        state: createForm.state.trim() || null,
        pincode: createForm.pincode.trim() || null,
        latitude: createForm.latitude.trim() ? Number(createForm.latitude) : null,
        longitude: createForm.longitude.trim() ? Number(createForm.longitude) : null,
      });
      const createdName = createForm.area_name.trim();
      setCreateForm({ ...EMPTY_CREATE_FORM });
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success(`Area created: ${createdName}`, { duration: 5000 });
      setFeedback(`Area created: ${createdName}`);
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
      await patchBackend(`/masters/areas/${selected.id}`, {
        area_name: selected.area_name.trim(),
        city: selected.city.trim() || null,
        state: selected.state.trim() || null,
        pincode: selected.pincode.trim() || null,
        latitude: selected.latitude.trim() ? Number(selected.latitude) : null,
        longitude: selected.longitude.trim() ? Number(selected.longitude) : null,
        is_active: selected.is_active,
      });
      toast.success(`Area updated: ${selected.area_name}`, { duration: 5000 });
      setFeedback(`Area updated: ${selected.area_name}`);
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
    if (!window.confirm(`Delete ${selectedIds.length} selected area(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/areas/${id}`)));
      toast.success(`Deleted ${selectedIds.length} area(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} area(s).`);
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
        <CardTitle>Areas (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search area, city, state, pincode"
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
              <Button>Add Area</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Area</DialogTitle>
                <DialogDescription>Create a geographic area used by routes.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Area Name *</Label>
                  <Input value={createForm.area_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, area_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={createForm.city} onChange={(e) => setCreateForm((prev) => ({ ...prev, city: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input value={createForm.state} onChange={(e) => setCreateForm((prev) => ({ ...prev, state: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Pincode</Label>
                  <Input value={createForm.pincode} onChange={(e) => setCreateForm((prev) => ({ ...prev, pincode: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input value={createForm.latitude} onChange={(e) => setCreateForm((prev) => ({ ...prev, latitude: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input value={createForm.longitude} onChange={(e) => setCreateForm((prev) => ({ ...prev, longitude: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createArea} disabled={creating || !createForm.area_name.trim()}>
                  {creating ? "Creating..." : "Create Area"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1100px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Area</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">City</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">State</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Pincode</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Latitude</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Longitude</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 12 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No areas found.
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
                    <TableCell>{row.area_name}</TableCell>
                    <TableCell>{row.city || "-"}</TableCell>
                    <TableCell>{row.state || "-"}</TableCell>
                    <TableCell>{row.pincode || "-"}</TableCell>
                    <TableCell>{row.latitude || "-"}</TableCell>
                    <TableCell>{row.longitude || "-"}</TableCell>
                    <TableCell>
                      <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Edit
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Edit Area</DialogTitle>
                            <DialogDescription>Update area details and save.</DialogDescription>
                          </DialogHeader>
                          {selected ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 md:col-span-2">
                                <Label>Area Name</Label>
                                <Input value={selected.area_name} onChange={(e) => updateSelected("area_name", e.target.value)} />
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
          page={currentPage}
          loading={loading}
          pageSize={pageSize}
          totalItems={totalCount}
          totalPages={totalPages}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            resetPage();
          }}
          onFirst={() => setCurrentPage(1)}
          onPrevious={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setCurrentPage((prev) => Math.min(totalPages || 1, prev + 1))}
          onLast={() => setCurrentPage(totalPages || 1)}
        />
      </CardContent>
    </Card>
  );
}
