"use client";

import type { Dispatch, SetStateAction } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type LookupOption = { id: string; name: string };
type SubCategoryOption = LookupOption & { category_id?: string };
type UnitOption = { id: string; unit_code: string; unit_name: string };
type HsnOption = { id: string; hsn_code: string; gst_percent: string };

type ProductForm = {
  sku: string;
  name: string;
  brand_id: string;
  category_id: string;
  sub_category_id: string;
  description: string;
  hsn_id: string;
  primary_unit_id: string;
  secondary_unit_id: string;
  third_unit_id: string;
  secondary_unit_quantity: string;
  third_unit_quantity: string;
  weight_in_grams: string;
  base_price: string;
  tax_percent: string;
};

type ProductRow = ProductForm & {
  id: string;
  brand: string;
  category: string;
  sub_category: string;
  unit: string;
};

const DEFAULT_PAGE_SIZE = 50;

const EMPTY_FORM: ProductForm = {
  sku: "",
  name: "",
  brand_id: "",
  category_id: "",
  sub_category_id: "",
  description: "",
  hsn_id: "",
  primary_unit_id: "",
  secondary_unit_id: "",
  third_unit_id: "",
  secondary_unit_quantity: "",
  third_unit_quantity: "",
  weight_in_grams: "",
  base_price: "",
  tax_percent: "",
};

function asText(value: unknown) {
  return String(value ?? "");
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRow(row: Record<string, unknown>): ProductRow {
  return {
    id: asText(row.id),
    sku: asText(row.sku),
    name: asText(row.name),
    brand_id: asText(row.brand_id),
    category_id: asText(row.category_id),
    sub_category_id: asText(row.sub_category_id),
    description: asText(row.description),
    hsn_id: asText(row.hsn_id),
    primary_unit_id: asText(row.primary_unit_id),
    secondary_unit_id: asText(row.secondary_unit_id),
    third_unit_id: asText(row.third_unit_id),
    secondary_unit_quantity: asText(row.secondary_unit_quantity),
    third_unit_quantity: asText(row.third_unit_quantity),
    weight_in_grams: asText(row.weight_in_grams),
    base_price: asText(row.base_price),
    tax_percent: asText(row.tax_percent),
    brand: asText(row.brand),
    category: asText(row.category),
    sub_category: asText(row.sub_category),
    unit: asText(row.unit),
  };
}

function buildPayload(form: ProductForm) {
  return {
    sku: form.sku.trim(),
    name: form.name.trim(),
    brand_id: form.brand_id || null,
    category_id: form.category_id || null,
    sub_category_id: form.sub_category_id || null,
    description: form.description.trim() || null,
    hsn_id: form.hsn_id || null,
    primary_unit_id: form.primary_unit_id || null,
    secondary_unit_id: form.secondary_unit_id || null,
    third_unit_id: form.third_unit_id || null,
    secondary_unit_quantity: form.secondary_unit_id ? toNullableNumber(form.secondary_unit_quantity) : null,
    third_unit_quantity: form.third_unit_id ? toNullableNumber(form.third_unit_quantity) : null,
    weight_in_grams: toNullableNumber(form.weight_in_grams),
    base_price: Number(form.base_price || "0"),
    tax_percent: Number(form.tax_percent || "0"),
  };
}

function productRowToForm(row: ProductRow): ProductForm {
  return {
    sku: row.sku,
    name: row.name,
    brand_id: row.brand_id,
    category_id: row.category_id,
    sub_category_id: row.sub_category_id,
    description: row.description,
    hsn_id: row.hsn_id,
    primary_unit_id: row.primary_unit_id,
    secondary_unit_id: row.secondary_unit_id,
    third_unit_id: row.third_unit_id,
    secondary_unit_quantity: row.secondary_unit_quantity,
    third_unit_quantity: row.third_unit_quantity,
    weight_in_grams: row.weight_in_grams,
    base_price: row.base_price,
    tax_percent: row.tax_percent,
  };
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  placeholder: string;
}) {
  return (
    <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ProductFormFields({
  form,
  setForm,
  brands,
  categories,
  subCategories,
  units,
  hsnOptions,
  onQuickCreate,
}: {
  form: ProductForm;
  setForm: Dispatch<SetStateAction<ProductForm>>;
  brands: LookupOption[];
  categories: LookupOption[];
  subCategories: SubCategoryOption[];
  units: UnitOption[];
  hsnOptions: HsnOption[];
  onQuickCreate: (type: "brand" | "category" | "subCategory" | "unit" | "hsn") => void;
}) {
  const filteredSubCategories = form.category_id ? subCategories.filter((item) => !item.category_id || item.category_id === form.category_id) : subCategories;
  const selectedHsn = hsnOptions.find((item) => item.id === form.hsn_id) ?? null;

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <Label>SKU *</Label>
        <Input value={form.sku} onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Name *</Label>
        <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Brand</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => onQuickCreate("brand")}>
            + Add Brand
          </Button>
        </div>
        <SelectField
          value={form.brand_id}
          onChange={(value) => setForm((prev) => ({ ...prev, brand_id: value }))}
          options={brands.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Select brand"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Category</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => onQuickCreate("category")}>
            + Add Category
          </Button>
        </div>
        <SelectField
          value={form.category_id}
          onChange={(value) => setForm((prev) => ({ ...prev, category_id: value, sub_category_id: "" }))}
          options={categories.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Select category"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Sub Category</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => onQuickCreate("subCategory")}>
            + Add Sub Category
          </Button>
        </div>
        <SelectField
          value={form.sub_category_id}
          onChange={(value) => setForm((prev) => ({ ...prev, sub_category_id: value }))}
          options={filteredSubCategories.map((item) => ({ id: item.id, label: item.name }))}
          placeholder="Select sub category"
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>HSN</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => onQuickCreate("hsn")}>
            + Add HSN
          </Button>
        </div>
        <SelectField
          value={form.hsn_id}
          onChange={(value) => {
            const matched = hsnOptions.find((item) => item.id === value);
            setForm((prev) => ({ ...prev, hsn_id: value, tax_percent: matched?.gst_percent ?? prev.tax_percent }));
          }}
          options={hsnOptions.map((item) => ({ id: item.id, label: `${item.hsn_code} (${item.gst_percent}%)` }))}
          placeholder="Select HSN"
        />
      </div>
      <div className="space-y-1 md:col-span-2">
        <Label>Description</Label>
        <Textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <Label>Primary Unit *</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => onQuickCreate("unit")}>
            + Add Unit
          </Button>
        </div>
        <SelectField
          value={form.primary_unit_id}
          onChange={(value) => setForm((prev) => ({ ...prev, primary_unit_id: value }))}
          options={units.map((item) => ({ id: item.id, label: `${item.unit_code} - ${item.unit_name}` }))}
          placeholder="Select primary unit"
        />
      </div>
      <div className="space-y-1">
        <Label>Secondary Unit</Label>
        <SelectField
          value={form.secondary_unit_id}
          onChange={(value) =>
            setForm((prev) => ({
              ...prev,
              secondary_unit_id: value,
              secondary_unit_quantity: value ? prev.secondary_unit_quantity : "",
              third_unit_id: value ? prev.third_unit_id : "",
              third_unit_quantity: value ? prev.third_unit_quantity : "",
            }))
          }
          options={units.map((item) => ({ id: item.id, label: `${item.unit_code} - ${item.unit_name}` }))}
          placeholder="Optional"
        />
      </div>
      {form.secondary_unit_id ? (
        <div className="space-y-1">
          <Label>How many primary units in second unit</Label>
          <Input
            value={form.secondary_unit_quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, secondary_unit_quantity: e.target.value }))}
          />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label>Third Unit</Label>
        <SelectField
          value={form.third_unit_id}
          onChange={(value) => setForm((prev) => ({ ...prev, third_unit_id: value, third_unit_quantity: value ? prev.third_unit_quantity : "" }))}
          options={units.map((item) => ({ id: item.id, label: `${item.unit_code} - ${item.unit_name}` }))}
          placeholder={form.secondary_unit_id ? "Optional" : "Select secondary unit first"}
        />
      </div>
      {form.third_unit_id ? (
        <div className="space-y-1">
          <Label>How many second units in third unit</Label>
          <Input value={form.third_unit_quantity} onChange={(e) => setForm((prev) => ({ ...prev, third_unit_quantity: e.target.value }))} />
        </div>
      ) : null}
      <div className="space-y-1">
        <Label>Weight in grams</Label>
        <Input value={form.weight_in_grams} onChange={(e) => setForm((prev) => ({ ...prev, weight_in_grams: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Base Price *</Label>
        <Input value={form.base_price} onChange={(e) => setForm((prev) => ({ ...prev, base_price: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>GST / Tax % *</Label>
        <Input value={form.tax_percent} onChange={(e) => setForm((prev) => ({ ...prev, tax_percent: e.target.value }))} />
        {selectedHsn ? <p className="text-xs text-muted-foreground">Auto-filled from HSN {selectedHsn.hsn_code}.</p> : null}
      </div>
    </div>
  );
}

export function ProductsAdminEditor() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState<ProductForm>({ ...EMPTY_FORM });
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ProductForm>({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [brands, setBrands] = useState<LookupOption[]>([]);
  const [categories, setCategories] = useState<LookupOption[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategoryOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [hsnOptions, setHsnOptions] = useState<HsnOption[]>([]);
  const [quickCreateType, setQuickCreateType] = useState<"" | "brand" | "category" | "subCategory" | "unit" | "hsn">("");
  const [quickName, setQuickName] = useState("");
  const [quickCode, setQuickCode] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickGst, setQuickGst] = useState("0");
  const [quickCategoryId, setQuickCategoryId] = useState("");
  const [quickCreating, setQuickCreating] = useState(false);
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage("products-admin", 1, DEFAULT_PAGE_SIZE);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const selected = useMemo(() => products.find((item) => item.id === openId) ?? null, [products, openId]);
  const editDirty = selected ? JSON.stringify(editForm) !== JSON.stringify(productRowToForm(selected)) : false;

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
      const response = asObject(await fetchBackend(`/masters/products?${params.toString()}`));
      setProducts(asArray(response.items).map(mapRow));
      setCurrentPage(Number(response.page ?? page));
      setTotalPages(Number(response.total_pages ?? 0));
      setTotalCount(Number(response.total ?? 0));
    } catch (error) {
      setProducts([]);
      setTotalPages(0);
      setTotalCount(0);
      resetPage();
      setFeedback(`Load failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadReferences() {
    try {
      const [brandsRes, categoriesRes, subCategoriesRes, unitsRes, hsnRes] = await Promise.all([
        fetchBackend("/masters/product-brands?page=1&page_size=200"),
        fetchBackend("/masters/product-categories?page=1&page_size=200"),
        fetchBackend("/masters/product-sub-categories?page=1&page_size=200"),
        fetchBackend("/masters/units?page=1&page_size=200"),
        fetchBackend("/masters/hsn?page=1&page_size=200"),
      ]);
      setBrands(asArray(asObject(brandsRes).items).map((item) => ({ id: asText(item.id), name: asText(item.name) })));
      setCategories(asArray(asObject(categoriesRes).items).map((item) => ({ id: asText(item.id), name: asText(item.name) })));
      setSubCategories(
        asArray(asObject(subCategoriesRes).items).map((item) => ({
          id: asText(item.id),
          name: asText(item.name),
          category_id: asText(item.category_id),
        }))
      );
      setUnits(
        asArray(asObject(unitsRes).items).map((item) => ({
          id: asText(item.id),
          unit_code: asText(item.unit_code),
          unit_name: asText(item.unit_name),
        }))
      );
      setHsnOptions(
        asArray(asObject(hsnRes).items).map((item) => ({
          id: asText(item.id),
          hsn_code: asText(item.hsn_code),
          gst_percent: asText(item.gst_percent),
        }))
      );
    } catch {
      setBrands([]);
      setCategories([]);
      setSubCategories([]);
      setUnits([]);
      setHsnOptions([]);
    }
  }

  useEffect(() => {
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize]);

  useEffect(() => {
    void loadReferences();
  }, []);

  useEffect(() => {
    if (!selected) {
      setEditForm({ ...EMPTY_FORM });
      return;
    }
    setEditForm(productRowToForm(selected));
  }, [selected]);

  async function createProduct() {
    if (!createForm.sku.trim() || !createForm.name.trim() || !createForm.primary_unit_id || !createForm.base_price.trim() || !createForm.tax_percent.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/products", buildPayload(createForm));
      setCreateForm({ ...EMPTY_FORM });
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success("Product created.", { duration: 4000 });
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function saveProduct() {
    if (!selected || !editDirty) {
      return;
    }
    setSaving(true);
    setFeedback("");
    try {
      await patchBackend(`/masters/products/${selected.id}`, buildPayload(editForm));
      setOpenId(null);
      await load(currentPage, search, pageSize);
      toast.success("Product updated.", { duration: 4000 });
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: string) {
    setFeedback("");
    try {
      await deleteBackend(`/masters/products/${id}`);
      await load(currentPage, search, pageSize);
      toast.success("Product deleted.", { duration: 4000 });
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  async function quickCreate() {
    if (!quickCreateType) {
      return;
    }
    setQuickCreating(true);
    try {
      if (quickCreateType === "brand") {
        await postBackend("/masters/product-brands", { name: quickName.trim() });
      } else if (quickCreateType === "category") {
        await postBackend("/masters/product-categories", { name: quickName.trim() });
      } else if (quickCreateType === "subCategory") {
        await postBackend("/masters/product-sub-categories", { name: quickName.trim(), category_id: quickCategoryId || null });
      } else if (quickCreateType === "unit") {
        await postBackend("/masters/units", { unit_code: quickCode.trim(), unit_name: quickName.trim() });
      } else if (quickCreateType === "hsn") {
        await postBackend("/masters/hsn", {
          hsn_code: quickCode.trim(),
          description: quickDescription.trim() || null,
          gst_percent: Number(quickGst || "0"),
        });
      }
      setQuickCreateType("");
      setQuickName("");
      setQuickCode("");
      setQuickDescription("");
      setQuickGst("0");
      setQuickCategoryId("");
      await loadReferences();
      toast.success("Master created.", { duration: 4000 });
    } catch (error) {
      toast.error(`Create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setQuickCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Products</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search SKU, name, brand, category"
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
              <Button>Add Product</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle>Add Product</DialogTitle>
                <DialogDescription>Name is the display name. Units are driven from the selected primary, secondary, and third masters.</DialogDescription>
              </DialogHeader>
              <ProductFormFields
                form={createForm}
                setForm={setCreateForm}
                brands={brands}
                categories={categories}
                subCategories={subCategories}
                units={units}
                hsnOptions={hsnOptions}
                onQuickCreate={(type) => setQuickCreateType(type)}
              />
              <DialogFooter>
                <Button
                  onClick={createProduct}
                  disabled={
                    creating ||
                    !createForm.sku.trim() ||
                    !createForm.name.trim() ||
                    !createForm.primary_unit_id ||
                    !createForm.base_price.trim() ||
                    !createForm.tax_percent.trim()
                  }
                >
                  {creating ? "Creating..." : "Create Product"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={quickCreateType !== ""} onOpenChange={(open) => !open && setQuickCreateType("")}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {quickCreateType === "brand"
                    ? "Add Brand"
                    : quickCreateType === "category"
                      ? "Add Category"
                      : quickCreateType === "subCategory"
                        ? "Add Sub Category"
                        : quickCreateType === "unit"
                          ? "Add Unit"
                          : "Add HSN"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                {quickCreateType === "unit" || quickCreateType === "hsn" ? (
                  <div className="space-y-1">
                    <Label>{quickCreateType === "unit" ? "Code" : "HSN Number"}</Label>
                    <Input value={quickCode} onChange={(e) => setQuickCode(e.target.value.toUpperCase())} />
                  </div>
                ) : null}
                {quickCreateType !== "hsn" ? (
                  <div className="space-y-1">
                    <Label>{quickCreateType === "unit" ? "Unit Name" : "Name"}</Label>
                    <Input value={quickName} onChange={(e) => setQuickName(e.target.value)} />
                  </div>
                ) : null}
                {quickCreateType === "subCategory" ? (
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <SelectField
                      value={quickCategoryId}
                      onChange={setQuickCategoryId}
                      options={categories.map((item) => ({ id: item.id, label: item.name }))}
                      placeholder="Optional"
                    />
                  </div>
                ) : null}
                {quickCreateType === "hsn" ? (
                  <>
                    <div className="space-y-1">
                      <Label>Description</Label>
                      <Input value={quickDescription} onChange={(e) => setQuickDescription(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>GST %</Label>
                      <Input value={quickGst} onChange={(e) => setQuickGst(e.target.value)} />
                    </div>
                  </>
                ) : null}
              </div>
              <DialogFooter>
                <Button
                  onClick={quickCreate}
                  disabled={
                    quickCreating ||
                    ((quickCreateType === "brand" || quickCreateType === "category" || quickCreateType === "subCategory" || quickCreateType === "unit") &&
                      !quickName.trim()) ||
                    ((quickCreateType === "unit" || quickCreateType === "hsn") && !quickCode.trim())
                  }
                >
                  {quickCreating ? "Saving..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}
        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1500px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Sub Category</TableHead>
                <TableHead>Primary Unit</TableHead>
                <TableHead>Secondary</TableHead>
                <TableHead>Third</TableHead>
                <TableHead>Base Price</TableHead>
                <TableHead>GST %</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loading && products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground">
                    No products found.
                  </TableCell>
                </TableRow>
              ) : null}
              {products.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.sku || "-"}</TableCell>
                  <TableCell>{row.name || "-"}</TableCell>
                  <TableCell>{row.brand || "-"}</TableCell>
                  <TableCell>{row.category || "-"}</TableCell>
                  <TableCell>{row.sub_category || "-"}</TableCell>
                  <TableCell>{row.unit || "-"}</TableCell>
                  <TableCell>{row.secondary_unit_quantity || "-"}</TableCell>
                  <TableCell>{row.third_unit_quantity || "-"}</TableCell>
                  <TableCell>{row.base_price || "0"}</TableCell>
                  <TableCell>{row.tax_percent || "0"}</TableCell>
                  <TableCell>{hsnOptions.find((item) => item.id === row.hsn_id)?.hsn_code || "-"}</TableCell>
                  <TableCell className="max-w-[220px] truncate">{row.description || "-"}</TableCell>
                  <TableCell className="flex gap-2">
                    <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
                        <DialogHeader>
                          <DialogTitle>Edit Product</DialogTitle>
                          <DialogDescription>Without changes, Save stays disabled.</DialogDescription>
                        </DialogHeader>
                        <ProductFormFields
                          form={editForm}
                          setForm={setEditForm}
                          brands={brands}
                          categories={categories}
                          subCategories={subCategories}
                          units={units}
                          hsnOptions={hsnOptions}
                          onQuickCreate={(type) => setQuickCreateType(type)}
                        />
                        <DialogFooter>
                          <Button
                            onClick={saveProduct}
                            disabled={saving || !editForm.sku.trim() || !editForm.name.trim() || !editForm.primary_unit_id || !editDirty}
                          >
                            {saving ? "Saving..." : "Save"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="destructive" onClick={() => void deleteProduct(row.id)}>
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
