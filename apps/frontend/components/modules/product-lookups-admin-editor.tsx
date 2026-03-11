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

type CategoryOption = { id: string; name: string };
type LookupRow = { id: string; name: string; is_active: boolean; category_id?: string; category_name?: string };

const DEFAULT_PAGE_SIZE = 50;

function mapRow(row: Record<string, unknown>): LookupRow {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    is_active: Boolean(row.is_active ?? true),
    category_id: row.category_id ? String(row.category_id) : "",
    category_name: row.category_name ? String(row.category_name) : "",
  };
}

export function ProductLookupsAdminEditor({
  title,
  endpoint,
  entityLabel,
  withCategory = false,
}: {
  title: string;
  endpoint: "/masters/product-brands" | "/masters/product-categories" | "/masters/product-sub-categories";
  entityLabel: string;
  withCategory?: boolean;
}) {
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    `lookup-${endpoint}`,
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const isDirty = selected ? editName.trim() !== selected.name || (withCategory && editCategoryId !== (selected.category_id ?? "")) : false;

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
      const response = asObject(await fetchBackend(`${endpoint}?${params.toString()}`));
      setRows(asArray(response.items).map(mapRow));
      setCurrentPage(Number(response.page ?? page));
      setTotalPages(Number(response.total_pages ?? 0));
      setTotalCount(Number(response.total ?? 0));
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

  async function loadCategories() {
    if (!withCategory) {
      return;
    }
    try {
      const response = asObject(await fetchBackend("/masters/product-categories?page=1&page_size=200"));
      setCategories(
        asArray(response.items).map((item) => ({
          id: String(item.id ?? ""),
          name: String(item.name ?? ""),
        }))
      );
    } catch {
      setCategories([]);
    }
  }

  useEffect(() => {
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize, endpoint]);

  useEffect(() => {
    void loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withCategory]);

  useEffect(() => {
    if (!selected) {
      setEditName("");
      setEditCategoryId("");
      return;
    }
    setEditName(selected.name);
    setEditCategoryId(selected.category_id ?? "");
  }, [selected]);

  async function createItem() {
    if (!createName.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend(endpoint, {
        name: createName.trim(),
        category_id: withCategory ? createCategoryId || null : undefined,
        is_active: true,
      });
      setCreateName("");
      setCreateCategoryId("");
      setOpenCreateDialog(false);
      await load(1, search, pageSize);
      resetPage();
      toast.success(`${entityLabel} created.`, { duration: 4000 });
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function saveItem() {
    if (!selected || !isDirty) {
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await patchBackend(`${endpoint}/${selected.id}`, {
        name: editName.trim(),
        category_id: withCategory ? editCategoryId || null : undefined,
      });
      setOpenId(null);
      await load(currentPage, search, pageSize);
      toast.success(`${entityLabel} updated.`, { duration: 4000 });
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    setFeedback("");
    try {
      await deleteBackend(`${endpoint}/${id}`);
      await load(currentPage, search, pageSize);
      toast.success(`${entityLabel} removed.`, { duration: 4000 });
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder={`Search ${entityLabel.toLowerCase()}`}
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
              <Button>Add {entityLabel}</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add {entityLabel}</DialogTitle>
                <DialogDescription>Create a new {entityLabel.toLowerCase()} master.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={createName} onChange={(e) => setCreateName(e.target.value)} />
                </div>
                {withCategory ? (
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={createCategoryId}
                      onChange={(e) => setCreateCategoryId(e.target.value)}
                    >
                      <option value="">No category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
              <DialogFooter>
                <Button onClick={createItem} disabled={creating || !createName.trim()}>
                  {creating ? "Saving..." : `Create ${entityLabel}`}
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
                <TableHead>Name</TableHead>
                {withCategory ? <TableHead>Category</TableHead> : null}
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={withCategory ? 4 : 3} className="text-center text-muted-foreground">
                    No records found.
                  </TableCell>
                </TableRow>
              ) : null}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.name || "-"}</TableCell>
                  {withCategory ? <TableCell>{row.category_name || "-"}</TableCell> : null}
                  <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Edit {entityLabel}</DialogTitle>
                          <DialogDescription>Save stays disabled until you change a field.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <Label>Name</Label>
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                          </div>
                          {withCategory ? (
                            <div className="space-y-1">
                              <Label>Category</Label>
                              <select
                                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={editCategoryId}
                                onChange={(e) => setEditCategoryId(e.target.value)}
                              >
                                <option value="">No category</option>
                                {categories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                        <DialogFooter>
                          <Button onClick={saveItem} disabled={saving || !editName.trim() || !isDirty}>
                            {saving ? "Saving..." : "Save"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => void deleteItem(row.id)} disabled={!row.is_active}>
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
