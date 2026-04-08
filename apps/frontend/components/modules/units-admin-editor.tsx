"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackendFresh, patchBackend, postBackend } from "@/lib/backend-api";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UnitRow = { id: string; unit_code: string; unit_name: string };

const DEFAULT_PAGE_SIZE = 50;

function mapRow(row: Record<string, unknown>): UnitRow {
  return {
    id: String(row.id ?? ""),
    unit_code: String(row.unit_code ?? ""),
    unit_name: String(row.unit_name ?? ""),
  };
}

export function UnitsAdminEditor() {
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage("units-admin", 1, DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const isDirty = selected ? editCode.trim() !== selected.unit_code || editName.trim() !== selected.unit_name : false;

  async function load(page: number, searchText: string, pageSizeValue = pageSize) {
    setLoading(true);
    setFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSizeValue));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const res = asObject(await fetchBackendFresh(`/masters/units?${params.toString()}`));
      setRows(asArray(res.items).map(mapRow));
      setCurrentPage(Number(res.page ?? page));
      setTotalPages(Number(res.total_pages ?? 0));
      setTotalCount(Number(res.total ?? 0));
    } catch (error) {
      setRows([]);
      setTotalPages(0);
      setTotalCount(0);
      resetPage();
      setFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize]);

  useEffect(() => {
    if (!selected) {
      setEditCode("");
      setEditName("");
      return;
    }
    setEditCode(selected.unit_code);
    setEditName(selected.unit_name);
  }, [selected]);

  async function createUnit() {
    if (!createCode.trim() || !createName.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/units", { unit_code: createCode.trim(), unit_name: createName.trim() });
      setCreateCode("");
      setCreateName("");
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success("Unit created.", { duration: 4000 });
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function saveUnit() {
    if (!selected || !isDirty) {
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await patchBackend(`/masters/units/${selected.id}`, { unit_code: editCode.trim(), unit_name: editName.trim() });
      setOpenId(null);
      await load(currentPage, search, pageSize);
      toast.success("Unit updated.", { duration: 4000 });
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }

  async function deleteUnit(id: string) {
    setFeedback("");
    try {
      await deleteBackend(`/masters/units/${id}`);
      await load(currentPage, search, pageSize);
      toast.success("Unit deleted.", { duration: 4000 });
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Units</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search unit code or name"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (!value.trim() && search) {
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
          <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
            <DialogTrigger asChild>
              <Button>Add Unit</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Unit</DialogTitle>
                <DialogDescription>Create a unit with both code and name.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Unit Code</Label>
                  <Input value={createCode} onChange={(e) => setCreateCode(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1">
                  <Label>Unit Name</Label>
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createUnit} disabled={creating || !createCode.trim() || !createName.trim()}>
                  {creating ? "Saving..." : "Create Unit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead>Unit Code</TableHead>
                <TableHead>Unit Name</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    No units found.
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.unit_code || "-"}</TableCell>
                  <TableCell>{row.unit_name || "-"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit Unit</DialogTitle>
                          <DialogDescription>Without changes, Save stays disabled.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label>Unit Code</Label>
                            <Input value={editCode} onChange={(e) => setEditCode(e.target.value.toUpperCase())} />
                          </div>
                          <div className="space-y-1">
                            <Label>Unit Name</Label>
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={saveUnit} disabled={saving || !editCode.trim() || !editName.trim() || !isDirty}>
                            {saving ? "Saving..." : "Save"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => void deleteUnit(row.id)}>
                      Delete
                    </Button>
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
