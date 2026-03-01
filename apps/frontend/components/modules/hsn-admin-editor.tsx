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

type HSNRow = { id: string; hsn_code: string; description: string; gst_percent: string; is_active: boolean };

const DEFAULT_PAGE_SIZE = 50;

export function HsnAdminEditor() {
  const [rows, setRows] = useState<HSNRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "hsn-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [newCode, setNewCode] = useState("");
  const [newGst, setNewGst] = useState("0");
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
      const res = asObject(await fetchBackend(`/masters/hsn?${params.toString()}`));
      setRows(
        asArray(res.items).map((item) => ({
          id: String(item.id ?? ""),
          hsn_code: String(item.hsn_code ?? ""),
          description: String(item.description ?? ""),
          gst_percent: String(item.gst_percent ?? "0"),
          is_active: Boolean(item.is_active ?? true),
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

  async function createHsn() {
    if (!newCode.trim()) {
      return;
    }
    setFeedback("");
    try {
      await postBackend("/masters/hsn", { hsn_code: newCode.trim(), gst_percent: Number(newGst || "0") });
      setNewCode("");
      setNewGst("0");
      await load(currentPage, search, pageSize);
      setFeedback("HSN created.");
    } catch (error) {
      setFeedback(`Create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async function saveHsn(row: HSNRow) {
    setFeedback("");
    try {
      await patchBackend(`/masters/hsn/${row.id}`, {
        hsn_code: row.hsn_code,
        description: row.description || null,
        gst_percent: Number(row.gst_percent || "0"),
        is_active: row.is_active,
      });
      setFeedback("HSN updated.");
      toast.success("HSN updated.", { duration: 5000 });
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
    if (!window.confirm(`Delete ${selectedIds.length} selected HSN record(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/hsn/${id}`)));
      setFeedback(`Deleted ${selectedIds.length} HSN record(s).`);
      toast.success(`Deleted ${selectedIds.length} HSN record(s).`, { duration: 5000 });
      await load(currentPage, search, pageSize);
    } catch (error) {
      setFeedback(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>HSN (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-3">
          <Input placeholder="HSN code" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
          <Input placeholder="GST %" value={newGst} onChange={(e) => setNewGst(e.target.value)} />
          <Button onClick={createHsn}>Add</Button>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Search HSN"
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
          <Table className="min-w-[900px]">
            <TableHeader>
            <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
              <TableHead className="w-10">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
              </TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">HSN</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Description</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">GST %</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Active</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {loading
              ? Array.from({ length: 12 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                    <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-56 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-14" /></TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No HSN records found.
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
                      value={row.hsn_code}
                      onChange={(e) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, hsn_code: e.target.value } : item)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.description}
                      onChange={(e) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, description: e.target.value } : item)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.gst_percent}
                      onChange={(e) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, gst_percent: e.target.value } : item)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) =>
                        setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, is_active: e.target.checked } : item)))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => saveHsn(row)}>
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
