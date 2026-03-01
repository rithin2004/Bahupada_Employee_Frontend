"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, patchBackend } from "@/lib/backend-api";
import { usePersistedPage } from "@/lib/state/pagination-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type PriceRow = {
  product_id: string;
  sku: string;
  mrp: string;
  cost_price: string;
  a_class_price: string;
  b_class_price: string;
  c_class_price: string;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 50;

function mapRow(row: Record<string, unknown>): PriceRow {
  return {
    product_id: String(row.product_id ?? ""),
    sku: String(row.sku ?? ""),
    mrp: String(row.mrp ?? "0"),
    cost_price: String(row.cost_price ?? "0"),
    a_class_price: String(row.a_class_price ?? "0"),
    b_class_price: String(row.b_class_price ?? "0"),
    c_class_price: String(row.c_class_price ?? "0"),
    is_active: Boolean(row.is_active ?? true),
  };
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PriceAdminEditor() {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "price-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load(page: number, searchText: string, pageSizeValue = pageSize) {
    setLoading(true);
    setFeedback("");
    setRows([]);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSizeValue));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/masters/pricing?${params.toString()}`));
      setRows(asArray(response.items).map(mapRow));
      setCurrentPage(Number(response.page ?? page));
      setTotalPages(Number(response.total_pages ?? 0));
      setTotalCount(Number(response.total ?? 0));
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
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize]);

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.product_id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  function updateRow(productId: string, field: keyof PriceRow, value: string | boolean) {
    setRows((prev) => prev.map((row) => (row.product_id === productId ? { ...row, [field]: value } : row)));
  }

  async function saveRow(row: PriceRow) {
    setSavingId(row.product_id);
    setFeedback("");
    try {
      await patchBackend(`/masters/pricing/${row.product_id}`, {
        mrp: toNumber(row.mrp),
        cost_price: toNumber(row.cost_price),
        a_class_price: toNumber(row.a_class_price),
        b_class_price: toNumber(row.b_class_price),
        c_class_price: toNumber(row.c_class_price),
        is_active: row.is_active,
      });
      setFeedback(`Saved pricing for ${row.sku}.`);
      toast.success(`Saved pricing for ${row.sku}.`, { duration: 5000 });
    } catch (error) {
      setFeedback(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Save failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteSelected() {
    if (!selectedIds.length || loading) {
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.length} selected product(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/products/${id}`)));
      setFeedback(`Deleted ${selectedIds.length} product(s).`);
      toast.success(`Deleted ${selectedIds.length} product(s).`, { duration: 5000 });
      await load(currentPage, search, pageSize);
    } catch (error) {
      setFeedback(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price Sheet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search SKU"
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
            className="bg-black text-white hover:bg-black/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
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
          <Table className="min-w-[1100px]">
            <TableHeader>
            <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
              <TableHead className="w-10">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
              </TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">SKU</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">MRP</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Cost</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">A Class</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">B Class</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">C Class</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Active</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Action</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {loading
              ? Array.from({ length: 12 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                    <TableCell><Skeleton className="h-5 w-5 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No pricing records found.
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              rows.map((row, index) => (
                <TableRow key={row.product_id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.product_id)}
                      onChange={(e) => toggleSelectOne(row.product_id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>
                    <Input value={row.mrp} onChange={(e) => updateRow(row.product_id, "mrp", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={row.cost_price} onChange={(e) => updateRow(row.product_id, "cost_price", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={row.a_class_price} onChange={(e) => updateRow(row.product_id, "a_class_price", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={row.b_class_price} onChange={(e) => updateRow(row.product_id, "b_class_price", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input value={row.c_class_price} onChange={(e) => updateRow(row.product_id, "c_class_price", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={row.is_active}
                      onChange={(e) => updateRow(row.product_id, "is_active", e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      className="bg-black text-white hover:bg-black/90 dark:bg-black dark:text-white dark:hover:bg-black/90"
                      onClick={() => saveRow(row)}
                      disabled={savingId === row.product_id}
                    >
                      {savingId === row.product_id ? "Saving..." : "Save"}
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
