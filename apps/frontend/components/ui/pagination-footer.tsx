"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";

import { Button } from "@/components/ui/button";

type PaginationFooterProps = {
  loading?: boolean;
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageSizeChange: (pageSize: number) => void;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
};

export function PaginationFooter({
  loading = false,
  page,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions = [25, 50, 100],
  onPageSizeChange,
  onFirst,
  onPrevious,
  onNext,
  onLast,
}: PaginationFooterProps) {
  const safePage = totalPages > 0 ? Math.min(Math.max(1, page), totalPages) : 0;
  const start = totalItems > 0 && safePage > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const end = totalItems > 0 && safePage > 0 ? Math.min(totalItems, safePage * pageSize) : 0;
  const disablePrev = loading || totalPages === 0 || safePage <= 1;
  const disableNext = loading || totalPages === 0 || safePage >= totalPages;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card px-3 py-2 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:text-sm">
        <span>
          Showing <span className="font-semibold text-foreground">{start}</span> to{" "}
          <span className="font-semibold text-foreground">{end}</span> of{" "}
          <span className="font-semibold text-foreground">{totalItems}</span>
        </span>
        <div className="h-4 w-px bg-border" />
        <label className="flex items-center gap-2 uppercase tracking-wide">
          Show
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs text-foreground md:text-sm"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            disabled={loading}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
        <Button variant="outline" size="icon" className="size-8" onClick={onFirst} disabled={disablePrev} aria-label="First page">
          <ChevronsLeft className="size-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={onPrevious} disabled={disablePrev}>
          Previous
        </Button>
        <span className="px-1.5 text-xs font-medium md:px-2 md:text-sm">
          Page {safePage} of {totalPages}
        </span>
        <Button size="sm" onClick={onNext} disabled={disableNext}>
          Next
        </Button>
        <Button variant="outline" size="icon" className="size-8" onClick={onLast} disabled={disableNext} aria-label="Last page">
          <ChevronsRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
