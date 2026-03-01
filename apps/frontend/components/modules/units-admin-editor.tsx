"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, patchBackend, postBackend } from "@/lib/backend-api";
import { usePersistedPage } from "@/lib/state/pagination-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type UnitRow = { id: string; unit_name: string };

const DEFAULT_PAGE_SIZE = 50;

export function UnitsAdminEditor() {
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "units-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [newUnit, setNewUnit] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
      const res = asObject(await fetchBackend(`/masters/units?${params.toString()}`));
      setRows(
        asArray(res.items).map((item) => ({
          id: String(item.id ?? ""),
          unit_name: String(item.unit_name ?? ""),
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
      setFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(currentPage, search, pageSize);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize]);

  async function createUnit() {
    if (!newUnit.trim()) {
      return;
    }
    setFeedback("");
    try {
      await postBackend("/masters/units", { unit_name: newUnit.trim() });
      setNewUnit("");
      await load(currentPage, search, pageSize);
      setFeedback("Unit created.");
    } catch (error) {
      setFeedback(`Create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async function saveUnit(id: string, unit_name: string) {
    setFeedback("");
    try {
      await patchBackend(`/masters/units/${id}`, { unit_name });
      setFeedback("Unit updated.");
      toast.success("Unit updated.", { duration: 5000 });
    } catch (error) {
      setFeedback(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    }
  }

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  async function deleteSelected() {
    if (!selectedIds.length || loading) {
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.length} selected unit(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/units/${id}`)));
      setFeedback(`Deleted ${selectedIds.length} unit(s).`);
      toast.success(`Deleted ${selectedIds.length} unit(s).`, { duration: 5000 });
      await load(currentPage, search, pageSize);
    } catch (error) {
      setFeedback(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Units (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Add unit (e.g. PCS, BOX, CASE)" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
          <Button onClick={createUnit}>Add</Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search unit"
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
        </div>
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[700px]">
            <TableHeader>
            <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
              <TableHead className="w-10">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
              </TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Unit Name</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {loading
              ? Array.from({ length: 12 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                    <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-48 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-14" /></TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No units found.
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
                  <TableCell>
                    <Input
                      value={row.unit_name}
                      onChange={(e) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, unit_name: e.target.value } : item)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => saveUnit(row.id, row.unit_name)}>
                      Save
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
