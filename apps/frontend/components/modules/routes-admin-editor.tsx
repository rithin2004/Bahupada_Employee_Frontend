"use client";

import Link from "next/link";
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

type RouteRow = {
  id: string;
  route_name: string;
  area_id: string;
  area_name: string;
  is_active: boolean;
};

type AreaOption = {
  id: string;
  area_name: string;
};

const DEFAULT_PAGE_SIZE = 50;
const EMPTY_CREATE_FORM = {
  route_name: "",
  area_id: "",
};

function mapRoute(row: Record<string, unknown>): RouteRow {
  return {
    id: String(row.id ?? ""),
    route_name: String(row.route_name ?? ""),
    area_id: String(row.area_id ?? ""),
    area_name: String(row.area_name ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

export function RoutesAdminEditor() {
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [areas, setAreas] = useState<AreaOption[]>([]);
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
    "routes-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  async function loadAreas() {
    try {
      const response = asObject(await fetchBackend("/masters/areas?page=1&page_size=100"));
      const nextAreas = asArray(response.items).map((row) => ({
        id: String(row.id ?? ""),
        area_name: String(row.area_name ?? ""),
      }));
      setAreas(nextAreas);
    } catch {
      setAreas([]);
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
      const response = asObject(await fetchBackend(`/masters/routes?${params.toString()}`));
      setRows(asArray(response.items).map(mapRoute));
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
    void loadAreas();
  }, []);

  useEffect(() => {
    if (!createForm.area_id && areas.length > 0) {
      setCreateForm((prev) => ({ ...prev, area_id: prev.area_id || areas[0].id }));
    }
  }, [areas, createForm.area_id]);

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

  function updateSelected(field: keyof RouteRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function createRoute() {
    if (!createForm.route_name.trim() || !createForm.area_id) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/routes", {
        route_name: createForm.route_name.trim(),
        area_id: createForm.area_id,
      });
      const createdName = createForm.route_name.trim();
      setCreateForm({ ...EMPTY_CREATE_FORM, area_id: areas[0]?.id ?? "" });
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success(`Route created: ${createdName}`, { duration: 5000 });
      setFeedback(`Route created: ${createdName}`);
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
      await patchBackend(`/masters/routes/${selected.id}`, {
        route_name: selected.route_name.trim(),
        area_id: selected.area_id,
        is_active: selected.is_active,
      });
      toast.success(`Route updated: ${selected.route_name}`, { duration: 5000 });
      setFeedback(`Route updated: ${selected.route_name}`);
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
    if (!window.confirm(`Delete ${selectedIds.length} selected route(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/routes/${id}`)));
      toast.success(`Deleted ${selectedIds.length} route(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} route(s).`);
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
        <CardTitle>Routes (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search route name or area"
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
          <Button variant="outline" asChild>
            <Link href="/areas">Manage Areas</Link>
          </Button>
          <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
            <DialogTrigger asChild>
              <Button>Add Route</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Route</DialogTitle>
                <DialogDescription>Create a route and map it to an area.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Route Name *</Label>
                  <Input
                    value={createForm.route_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, route_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Area *</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={createForm.area_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, area_id: e.target.value }))}
                  >
                    <option value="">Select area</option>
                    {areas.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.area_name}
                      </option>
                    ))}
                  </select>
                  {areas.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No areas found. Create an area first in the Areas Module.
                    </p>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createRoute} disabled={creating || !createForm.route_name.trim() || !createForm.area_id}>
                  {creating ? "Creating..." : "Create Route"}
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
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Route</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Area</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Active</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 12 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-52 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-44 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No routes found.
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
                    <TableCell>{row.route_name}</TableCell>
                    <TableCell>{row.area_name || "-"}</TableCell>
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
                            <DialogTitle>Edit Route</DialogTitle>
                            <DialogDescription>Update route mapping and save.</DialogDescription>
                          </DialogHeader>
                          {selected ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div className="space-y-1 md:col-span-2">
                                <Label>Route Name</Label>
                                <Input value={selected.route_name} onChange={(e) => updateSelected("route_name", e.target.value)} />
                              </div>
                              <div className="space-y-1 md:col-span-2">
                                <Label>Area</Label>
                                <select
                                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                  value={selected.area_id}
                                  onChange={(e) => {
                                    const nextAreaId = e.target.value;
                                    const area = areas.find((item) => item.id === nextAreaId);
                                    updateSelected("area_id", nextAreaId);
                                    updateSelected("area_name", area?.area_name ?? "");
                                  }}
                                >
                                  <option value="">Select area</option>
                                  {areas.map((area) => (
                                    <option key={area.id} value={area.id}>
                                      {area.area_name}
                                    </option>
                                  ))}
                                </select>
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
