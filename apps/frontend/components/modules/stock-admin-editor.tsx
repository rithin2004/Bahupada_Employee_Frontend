"use client";

import { useEffect, useState } from "react";

import { asArray, asObject, fetchBackend } from "@/lib/backend-api";
import { usePersistedPage } from "@/lib/state/pagination-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationFooter } from "@/components/ui/pagination-footer";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type StockRow = {
  batch_id: string;
  product_name: string;
  sku: string;
  batch_no: string;
  warehouse_name: string;
  warehouse_code: string;
  unit: string;
  available_quantity: string;
  reserved_quantity: string;
  damaged_quantity: string;
  expiry_date: string | null;
};

const DEFAULT_PAGE_SIZE = 50;

function mapStockRow(row: Record<string, unknown>): StockRow {
  return {
    batch_id: String(row.batch_id ?? ""),
    product_name: String(row.product_name ?? "-"),
    sku: String(row.sku ?? "-"),
    batch_no: String(row.batch_no ?? "-"),
    warehouse_name: String(row.warehouse_name ?? ""),
    warehouse_code: String(row.warehouse_code ?? ""),
    unit: String(row.unit ?? "-"),
    available_quantity: String(row.available_quantity ?? "0"),
    reserved_quantity: String(row.reserved_quantity ?? "0"),
    damaged_quantity: String(row.damaged_quantity ?? "0"),
    expiry_date: typeof row.expiry_date === "string" ? row.expiry_date : null,
  };
}

function formatDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "-";
  }
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

function toNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function StockAdminEditor() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "stock-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  async function loadPage(page: number, searchText: string, size = pageSize) {
    setLoading(true);
    setFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(size));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/procurement/stock-snapshot?${params.toString()}`));
      const items = asArray(response.items).map(mapStockRow);
      setRows(items);
      setTotalCount(Number(response.total ?? items.length));
      setTotalPages(Number(response.total_pages ?? 0));
      setCurrentPage(Number(response.page ?? page));
    } catch (error) {
      setRows([]);
      setTotalCount(0);
      setTotalPages(0);
      resetPage();
      setFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, search]);

  function onSearch() {
    resetPage();
    setSearch(searchInput.trim());
  }

  const pageAvailable = rows.reduce((sum, row) => sum + toNum(row.available_quantity), 0);
  const pageReserved = rows.reduce((sum, row) => sum + toNum(row.reserved_quantity), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Batch Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search by SKU, name, batch, warehouse"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (value.trim() === "" && search !== "") {
                resetPage();
                setSearch("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSearch();
              }
            }}
          />
          <Button onClick={onSearch} disabled={loading}>
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput("");
              resetPage();
              setSearch("");
            }}
            disabled={loading && search === ""}
          >
            Reset
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Total batches: {totalCount} | Available qty (page): {pageAvailable} | Reserved qty (page): {pageReserved}
        </p>
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1080px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Product</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">SKU</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Batch</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Warehouse</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Unit</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Available</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Reserved</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Damaged</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Expiry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 10 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell><Skeleton className="h-5 w-52 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-12 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    </TableRow>
                  ))
                : null}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No inventory batches found.
                  </TableCell>
                </TableRow>
              ) : null}
              {!loading &&
                rows.map((row, index) => (
                  <TableRow key={row.batch_id || `${row.sku}-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                    <TableCell>{row.product_name}</TableCell>
                    <TableCell>{row.sku}</TableCell>
                    <TableCell>{row.batch_no}</TableCell>
                    <TableCell>{row.warehouse_name || row.warehouse_code || "-"}</TableCell>
                    <TableCell>{row.unit}</TableCell>
                    <TableCell>{row.available_quantity}</TableCell>
                    <TableCell>{row.reserved_quantity}</TableCell>
                    <TableCell>{row.damaged_quantity}</TableCell>
                    <TableCell>{formatDate(row.expiry_date)}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        {totalCount > 50 ? (
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
        ) : null}
      </CardContent>
    </Card>
  );
}
