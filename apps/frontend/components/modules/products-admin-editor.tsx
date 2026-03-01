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

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  sub_category: string;
  unit: string;
  base_price: string;
  tax_percent: string;
  hsn_id: string;
  primary_unit_id: string;
  secondary_unit_id: string;
  third_unit_id: string;
  conv_2_to_1: string;
  conv_3_to_2: string;
  conv_3_to_1: string;
  weight_in_grams: string;
  is_bundle: boolean;
  bundle_price_override: string;
  is_active: boolean;
};

type UnitOption = { id: string; unit_name: string };
type HSNOption = { id: string; hsn_code: string; gst_percent: string };

const DEFAULT_PAGE_SIZE = 50;

const EMPTY_CREATE_FORM = {
  sku: "",
  name: "",
  display_name: "",
  brand: "",
  category: "",
  sub_category: "",
  description: "",
  unit: "PCS",
  hsn_id: "",
  primary_unit_id: "",
  secondary_unit_id: "",
  third_unit_id: "",
  conv_2_to_1: "",
  conv_3_to_2: "",
  conv_3_to_1: "",
  weight_in_grams: "",
  is_bundle: false,
  bundle_price_override: "",
  base_price: "",
  tax_percent: "",
};

function mapRow(row: Record<string, unknown>): ProductRow {
  return {
    id: String(row.id ?? ""),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    brand: String(row.brand ?? ""),
    category: String(row.category ?? ""),
    sub_category: String(row.sub_category ?? ""),
    unit: String(row.unit ?? "PCS"),
    base_price: String(row.base_price ?? "0"),
    tax_percent: String(row.tax_percent ?? "0"),
    hsn_id: String(row.hsn_id ?? ""),
    primary_unit_id: String(row.primary_unit_id ?? ""),
    secondary_unit_id: String(row.secondary_unit_id ?? ""),
    third_unit_id: String(row.third_unit_id ?? ""),
    conv_2_to_1: String(row.conv_2_to_1 ?? ""),
    conv_3_to_2: String(row.conv_3_to_2 ?? ""),
    conv_3_to_1: String(row.conv_3_to_1 ?? ""),
    weight_in_grams: String(row.weight_in_grams ?? ""),
    is_bundle: Boolean(row.is_bundle ?? false),
    bundle_price_override: String(row.bundle_price_override ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function ProductsAdminEditor() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "products-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<HSNOption[]>([]);

  const selected = useMemo(() => products.find((row) => row.id === openId) ?? null, [openId, products]);

  async function loadPage(page: number, searchText: string, pageSizeValue = pageSize) {
    setLoading(true);
    setFeedback("");
    setProducts([]);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSizeValue));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/masters/products?${params.toString()}`));
      const rows = asArray(response.items).map(mapRow);
      setProducts(rows);
      setTotalCount(Number(response.total ?? rows.length));
      setTotalPages(Number(response.total_pages ?? 0));
      setCurrentPage(Number(response.page ?? page));
      setSelectedIds([]);
    } catch (error) {
      setProducts([]);
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
  }, [currentPage, search, pageSize]);

  useEffect(() => {
    async function loadReferences() {
      try {
        const [unitsRes, hsnRes] = await Promise.all([
          fetchBackend("/masters/units?page=1&page_size=100"),
          fetchBackend("/masters/hsn?page=1&page_size=100"),
        ]);
        setUnits(
          asArray(asObject(unitsRes).items).map((item) => ({
            id: String(item.id ?? ""),
            unit_name: String(item.unit_name ?? ""),
          }))
        );
        setHsnOptions(
          asArray(asObject(hsnRes).items).map((item) => ({
            id: String(item.id ?? ""),
            hsn_code: String(item.hsn_code ?? ""),
            gst_percent: String(item.gst_percent ?? "0"),
          }))
        );
      } catch {
        setUnits([]);
        setHsnOptions([]);
      }
    }
    void loadReferences();
  }, []);

  function updateSelected(field: keyof ProductRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setProducts((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function saveSelected() {
    if (!selected) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/products/${selected.id}`, {
        sku: selected.sku,
        name: selected.name,
        brand: selected.brand || null,
        category: selected.category || null,
        sub_category: selected.sub_category || null,
        unit: selected.unit,
        base_price: Number(selected.base_price),
        tax_percent: Number(selected.tax_percent),
        hsn_id: selected.hsn_id || null,
        primary_unit_id: selected.primary_unit_id || null,
        secondary_unit_id: selected.secondary_unit_id || null,
        third_unit_id: selected.third_unit_id || null,
        conv_2_to_1: toNullableNumber(selected.conv_2_to_1),
        conv_3_to_2: toNullableNumber(selected.conv_3_to_2),
        conv_3_to_1: toNullableNumber(selected.conv_3_to_1),
        weight_in_grams: toNullableNumber(selected.weight_in_grams),
        is_bundle: selected.is_bundle,
        bundle_price_override: toNullableNumber(selected.bundle_price_override),
        is_active: selected.is_active,
      });
      setFeedback(`Updated ${selected.sku || selected.name}.`);
      toast.success(`Updated ${selected.sku || selected.name}.`, { duration: 5000 });
      setOpenId(null);
    } catch (error) {
      setFeedback(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Update failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setSavingId(null);
    }
  }

  async function createProduct() {
    if (!createForm.sku.trim() || !createForm.name.trim() || !createForm.unit.trim()) {
      return;
    }
    const basePrice = Number(createForm.base_price);
    const taxPercent = Number(createForm.tax_percent);
    if (!Number.isFinite(basePrice) || !Number.isFinite(taxPercent)) {
      const message = "Base price and tax percent are required numeric values.";
      setFeedback(message);
      toast.error(message, { duration: 5000 });
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/products", {
        sku: createForm.sku.trim(),
        name: createForm.name.trim(),
        display_name: createForm.display_name.trim() || null,
        brand: createForm.brand.trim() || null,
        category: createForm.category.trim() || null,
        sub_category: createForm.sub_category.trim() || null,
        description: createForm.description.trim() || null,
        unit: createForm.unit.trim(),
        hsn_id: createForm.hsn_id || null,
        primary_unit_id: createForm.primary_unit_id || null,
        secondary_unit_id: createForm.secondary_unit_id || null,
        third_unit_id: createForm.third_unit_id || null,
        conv_2_to_1: toNullableNumber(createForm.conv_2_to_1),
        conv_3_to_2: toNullableNumber(createForm.conv_3_to_2),
        conv_3_to_1: toNullableNumber(createForm.conv_3_to_1),
        weight_in_grams: toNullableNumber(createForm.weight_in_grams),
        is_bundle: createForm.is_bundle,
        bundle_price_override: toNullableNumber(createForm.bundle_price_override),
        base_price: basePrice,
        tax_percent: taxPercent,
      });
      setCreateForm({ ...EMPTY_CREATE_FORM });
      setOpenCreateDialog(false);
      resetPage();
      await loadPage(1, search, pageSize);
      const message = `Created ${createForm.sku.trim()}.`;
      setFeedback(message);
      toast.success(message, { duration: 5000 });
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function onNext() {
    if (loading || totalPages === 0 || currentPage >= totalPages) {
      return;
    }
    setCurrentPage((p) => p + 1);
  }

  async function onPrev() {
    if (loading || currentPage <= 1) {
      return;
    }
    setCurrentPage((p) => p - 1);
  }

  async function onFirst() {
    if (loading || currentPage <= 1) {
      return;
    }
    setCurrentPage(1);
  }

  async function onLast() {
    if (loading || totalPages === 0 || currentPage >= totalPages) {
      return;
    }
    setCurrentPage(totalPages);
  }

  function onSearch() {
    resetPage();
    setSearch(searchInput.trim());
  }

  const allSelected = products.length > 0 && selectedIds.length === products.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? products.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
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
      await loadPage(currentPage, search, pageSize);
    } catch (error) {
      setFeedback(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Products (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search SKU, name, display name, brand"
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
          <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
            Delete Selected
          </Button>
          <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
            <DialogTrigger asChild>
              <Button>Add Product</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add Product</DialogTitle>
                <DialogDescription>Create a product using the `ProductCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>SKU *</Label>
                  <Input value={createForm.sku} onChange={(e) => setCreateForm((prev) => ({ ...prev, sku: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Display Name</Label>
                  <Input
                    value={createForm.display_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, display_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Brand</Label>
                  <Input value={createForm.brand} onChange={(e) => setCreateForm((prev) => ({ ...prev, brand: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Input
                    value={createForm.category}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, category: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Sub Category</Label>
                  <Input
                    value={createForm.sub_category}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, sub_category: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Description</Label>
                  <Input
                    value={createForm.description}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Unit *</Label>
                  <Input value={createForm.unit} onChange={(e) => setCreateForm((prev) => ({ ...prev, unit: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>HSN</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={createForm.hsn_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, hsn_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {hsnOptions.map((hsn) => (
                      <option key={hsn.id} value={hsn.id}>
                        {hsn.hsn_code} ({hsn.gst_percent}%)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Primary Unit</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={createForm.primary_unit_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, primary_unit_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Secondary Unit</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={createForm.secondary_unit_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, secondary_unit_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Third Unit</Label>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={createForm.third_unit_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, third_unit_id: e.target.value }))}
                  >
                    <option value="">None</option>
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.unit_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Conv 2 to 1</Label>
                  <Input
                    value={createForm.conv_2_to_1}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, conv_2_to_1: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Conv 3 to 2</Label>
                  <Input
                    value={createForm.conv_3_to_2}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, conv_3_to_2: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Conv 3 to 1</Label>
                  <Input
                    value={createForm.conv_3_to_1}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, conv_3_to_1: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Weight (grams)</Label>
                  <Input
                    value={createForm.weight_in_grams}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, weight_in_grams: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Base Price *</Label>
                  <Input
                    value={createForm.base_price}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, base_price: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tax Percent *</Label>
                  <Input
                    value={createForm.tax_percent}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, tax_percent: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bundle Price Override</Label>
                  <Input
                    value={createForm.bundle_price_override}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, bundle_price_override: e.target.value }))}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={createForm.is_bundle}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, is_bundle: e.target.checked }))}
                  />
                  Is Bundle
                </label>
              </div>
              <DialogFooter>
                <Button
                  onClick={createProduct}
                  disabled={
                    creating ||
                    !createForm.sku.trim() ||
                    !createForm.name.trim() ||
                    !createForm.unit.trim() ||
                    !createForm.base_price.trim() ||
                    !createForm.tax_percent.trim()
                  }
                >
                  {creating ? "Creating..." : "Create Product"}
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
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">SKU</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Name</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Brand</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Base Price</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Tax %</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Edit</TableHead>
            </TableRow>
            </TableHeader>
            <TableBody>
            {loading ? (
              Array.from({ length: 12 }).map((_, index) => (
                <TableRow key={`skeleton-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                  <TableCell>
                    <Skeleton className="h-5 w-5 dark:h-5" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-40 dark:h-5" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-52 dark:h-5" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-28 dark:h-5" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20 dark:h-5" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14 dark:h-5" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-10 w-14 dark:h-8" />
                  </TableCell>
                </TableRow>
              ))
            ) : null}
            {!loading && products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No products found.
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              products.map((row, index) => (
              <TableRow key={row.id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(row.id)}
                    onChange={(e) => toggleSelectOne(row.id, e.target.checked)}
                  />
                </TableCell>
                <TableCell>{row.sku}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.brand || "-"}</TableCell>
                <TableCell>{row.base_price}</TableCell>
                <TableCell>{row.tax_percent}</TableCell>
                <TableCell>
                  <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline">
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Edit Product</DialogTitle>
                        <DialogDescription>Update core fields and save.</DialogDescription>
                      </DialogHeader>
                      {selected ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-1 md:col-span-2">
                            <Label>SKU</Label>
                            <Input value={selected.sku} onChange={(e) => updateSelected("sku", e.target.value)} />
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <Label>Name</Label>
                            <Input value={selected.name} onChange={(e) => updateSelected("name", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Brand</Label>
                            <Input value={selected.brand} onChange={(e) => updateSelected("brand", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Category</Label>
                            <Input value={selected.category} onChange={(e) => updateSelected("category", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Sub Category</Label>
                            <Input value={selected.sub_category} onChange={(e) => updateSelected("sub_category", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Unit</Label>
                            <Input value={selected.unit} onChange={(e) => updateSelected("unit", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>HSN</Label>
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                              value={selected.hsn_id}
                              onChange={(e) => updateSelected("hsn_id", e.target.value)}
                            >
                              <option value="">None</option>
                              {hsnOptions.map((hsn) => (
                                <option key={hsn.id} value={hsn.id}>
                                  {hsn.hsn_code} ({hsn.gst_percent}%)
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Primary Unit</Label>
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                              value={selected.primary_unit_id}
                              onChange={(e) => updateSelected("primary_unit_id", e.target.value)}
                            >
                              <option value="">None</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.unit_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Secondary Unit</Label>
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                              value={selected.secondary_unit_id}
                              onChange={(e) => updateSelected("secondary_unit_id", e.target.value)}
                            >
                              <option value="">None</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.unit_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Third Unit</Label>
                            <select
                              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                              value={selected.third_unit_id}
                              onChange={(e) => updateSelected("third_unit_id", e.target.value)}
                            >
                              <option value="">None</option>
                              {units.map((unit) => (
                                <option key={unit.id} value={unit.id}>
                                  {unit.unit_name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label>Conv 2 to 1</Label>
                            <Input value={selected.conv_2_to_1} onChange={(e) => updateSelected("conv_2_to_1", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Conv 3 to 2</Label>
                            <Input value={selected.conv_3_to_2} onChange={(e) => updateSelected("conv_3_to_2", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Conv 3 to 1</Label>
                            <Input value={selected.conv_3_to_1} onChange={(e) => updateSelected("conv_3_to_1", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Weight (grams)</Label>
                            <Input
                              value={selected.weight_in_grams}
                              onChange={(e) => updateSelected("weight_in_grams", e.target.value)}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Base Price</Label>
                            <Input value={selected.base_price} onChange={(e) => updateSelected("base_price", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Tax Percent</Label>
                            <Input value={selected.tax_percent} onChange={(e) => updateSelected("tax_percent", e.target.value)} />
                          </div>
                          <div className="space-y-1">
                            <Label>Bundle Price Override</Label>
                            <Input
                              value={selected.bundle_price_override}
                              onChange={(e) => updateSelected("bundle_price_override", e.target.value)}
                            />
                          </div>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.is_bundle}
                              onChange={(e) => updateSelected("is_bundle", e.target.checked)}
                            />
                            Is Bundle
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.is_active}
                              onChange={(e) => updateSelected("is_active", e.target.checked)}
                            />
                            Active
                          </label>
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
          loading={loading}
          page={currentPage}
          totalPages={totalPages}
          totalItems={totalCount}
          pageSize={pageSize}
          onPageSizeChange={(nextSize) => {
            setPageSize(nextSize);
            setCurrentPage(1);
          }}
          onFirst={onFirst}
          onPrevious={onPrev}
          onNext={onNext}
          onLast={onLast}
        />
      </CardContent>
    </Card>
  );
}
