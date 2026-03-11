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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type HsnRow = { id: string; hsn_code: string; description: string; gst_percent: string };

const DEFAULT_PAGE_SIZE = 50;

function mapRow(row: Record<string, unknown>): HsnRow {
  return {
    id: String(row.id ?? ""),
    hsn_code: String(row.hsn_code ?? ""),
    description: String(row.description ?? ""),
    gst_percent: String(row.gst_percent ?? "0"),
  };
}

export function HsnAdminEditor() {
  const [rows, setRows] = useState<HsnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createGst, setCreateGst] = useState("0");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGst, setEditGst] = useState("0");
  const [saving, setSaving] = useState(false);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage("hsn-admin", 1, DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const isDirty = selected
    ? editCode.trim() !== selected.hsn_code || editDescription !== selected.description || editGst.trim() !== selected.gst_percent
    : false;

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
      const res = asObject(await fetchBackend(`/masters/hsn?${params.toString()}`));
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
      setEditDescription("");
      setEditGst("0");
      return;
    }
    setEditCode(selected.hsn_code);
    setEditDescription(selected.description);
    setEditGst(selected.gst_percent);
  }, [selected]);

  async function createHsn() {
    if (!createCode.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/hsn", {
        hsn_code: createCode.trim(),
        description: createDescription.trim() || null,
        gst_percent: Number(createGst || "0"),
      });
      setCreateCode("");
      setCreateDescription("");
      setCreateGst("0");
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success("HSN created.", { duration: 4000 });
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function saveHsn() {
    if (!selected || !isDirty) {
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await patchBackend(`/masters/hsn/${selected.id}`, {
        hsn_code: editCode.trim(),
        description: editDescription.trim() || null,
        gst_percent: Number(editGst || "0"),
      });
      setOpenId(null);
      await load(currentPage, search, pageSize);
      toast.success("HSN updated.", { duration: 4000 });
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }

  async function deleteHsn(id: string) {
    setFeedback("");
    try {
      await deleteBackend(`/masters/hsn/${id}`);
      await load(currentPage, search, pageSize);
      toast.success("HSN deleted.", { duration: 4000 });
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HSN</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search HSN or description"
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
              <Button>Add HSN</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add HSN</DialogTitle>
                <DialogDescription>Create a HSN record with code, description, and GST %.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>HSN Number</Label>
                  <Input value={createCode} onChange={(e) => setCreateCode(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>GST %</Label>
                  <Input value={createGst} onChange={(e) => setCreateGst(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createHsn} disabled={creating || !createCode.trim()}>
                  {creating ? "Saving..." : "Create HSN"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[840px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead>HSN Number</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>GST %</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No HSN records found.
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.hsn_code || "-"}</TableCell>
                  <TableCell>{row.description || "-"}</TableCell>
                  <TableCell>{row.gst_percent || "0"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit HSN</DialogTitle>
                          <DialogDescription>Without changes, Save stays disabled.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label>HSN Number</Label>
                            <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Description</Label>
                            <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>GST %</Label>
                            <Input value={editGst} onChange={(e) => setEditGst(e.target.value)} />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={saveHsn} disabled={saving || !editCode.trim() || !isDirty}>
                            {saving ? "Saving..." : "Save"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => void deleteHsn(row.id)}>
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
