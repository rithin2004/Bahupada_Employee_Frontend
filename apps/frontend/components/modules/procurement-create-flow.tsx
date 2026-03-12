"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, postBackend, readPortalSession } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Option = {
  id: string;
  label: string;
};

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  brand: string;
};

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

type ChallanItem = {
  product_id: string;
  sku: string;
  name: string;
  quantity: string;
  expiry_date: string;
};

type ChallanForBill = {
  id: string;
  reference_no: string;
  vendor_name: string;
  warehouse_name: string;
  items: Array<{
    id: string;
    product_id: string;
    sku: string;
    name: string;
    batch_no: string;
    expiry_date: string | null;
    quantity: string;
  }>;
};

type BillItemDraft = {
  product_id: string;
  sku: string;
  name: string;
  batch_no: string;
  expiry_date: string;
  quantity: string;
  damaged_quantity: string;
  unit_price: string;
};

type PurchaseBillSummary = {
  id: string;
  bill_number: string;
  bill_date: string;
  status: string;
  posted: boolean;
  challan_reference_no: string;
  vendor_name: string;
  warehouse_name: string;
  entry_mode: "challan" | "direct";
  item_count: number;
};

function createReferenceNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `PC-${y}${m}${d}-${h}${min}${s}`;
}

function createBillNo() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `PB-${y}${m}${d}-${h}${min}`;
}

function createBillBatchNo(billDate: string, index: number) {
  const sanitizedDate = billDate.replaceAll("-", "") || new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `PBL-${sanitizedDate}-${String(index + 1).padStart(3, "0")}`;
}

function challanBatchPreview(index: number) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `CHL-${y}${m}${d}-AUTO-${String(index + 1).padStart(3, "0")}`;
}

const LIST_PAGE_SIZE = 50;

const EMPTY_INLINE_VENDOR_FORM = {
  name: "",
  firm_name: "",
  gstin: "",
  pan: "",
  owner_name: "",
  phone: "",
  alternate_phone: "",
  email: "",
  street: "",
  city: "",
  state: "",
  pincode: "",
  bank_account_number: "",
  ifsc_code: "",
};

const EMPTY_INLINE_WAREHOUSE_FORM = {
  code: "",
  name: "",
  street: "",
  city: "",
  state: "",
  pincode: "",
  latitude: "",
  longitude: "",
};

const EMPTY_PRODUCT_FORM: ProductForm = {
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

function buildProductPayload(form: ProductForm) {
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
    <select className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
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
  setForm: React.Dispatch<React.SetStateAction<ProductForm>>;
  brands: LookupOption[];
  categories: LookupOption[];
  subCategories: SubCategoryOption[];
  units: UnitOption[];
  hsnOptions: HsnOption[];
  onQuickCreate: (type: "brand" | "category" | "subCategory" | "unit" | "hsn") => void;
}) {
  const filteredSubCategories = form.category_id
    ? subCategories.filter((item) => !item.category_id || item.category_id === form.category_id)
    : subCategories;

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
          onChange={(value) => setForm((prev) => ({ ...prev, hsn_id: value }))}
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
          <Input value={form.secondary_unit_quantity} onChange={(e) => setForm((prev) => ({ ...prev, secondary_unit_quantity: e.target.value }))} />
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
      </div>
    </div>
  );
}

function hasAdminAccessToken() {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(readPortalSession().accessToken);
}

function isMissingBearerTokenError(error: unknown) {
  return error instanceof Error && error.message.toLowerCase().includes("missing bearer token");
}

export function ProcurementCreateFlow() {
  const [vendors, setVendors] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [racks, setRacks] = useState<Option[]>([]);

  const [vendorId, setVendorId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [rackId, setRackId] = useState("");
  const [referenceNo, setReferenceNo] = useState(createReferenceNo);
  const [productSearch, setProductSearch] = useState("");
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [productResults, setProductResults] = useState<ProductOption[]>([]);
  const [items, setItems] = useState<ChallanItem[]>([]);

  const [challans, setChallans] = useState<ChallanForBill[]>([]);
  const [bills, setBills] = useState<PurchaseBillSummary[]>([]);
  const [loadingChallans, setLoadingChallans] = useState(true);
  const [loadingBills, setLoadingBills] = useState(true);
  const [challanSearch, setChallanSearch] = useState("");
  const [billSearch, setBillSearch] = useState("");
  const [challanPage, setChallanPage] = useState(1);
  const [billPage, setBillPage] = useState(1);
  const [showNewChallan, setShowNewChallan] = useState(false);
  const [showNewBill, setShowNewBill] = useState(false);
  const [showVendorCreate, setShowVendorCreate] = useState(false);
  const [showWarehouseCreate, setShowWarehouseCreate] = useState(false);
  const [showRackCreate, setShowRackCreate] = useState(false);
  const [showProductCreate, setShowProductCreate] = useState(false);
  const [previewChallan, setPreviewChallan] = useState<ChallanForBill | null>(null);
  const [selectedChallanId, setSelectedChallanId] = useState("");
  const [billEntryMode, setBillEntryMode] = useState<"challan" | "direct">("direct");
  const [billNumber, setBillNumber] = useState(createBillNo);
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billItems, setBillItems] = useState<BillItemDraft[]>([]);
  const [billVendorId, setBillVendorId] = useState("");
  const [billWarehouseId, setBillWarehouseId] = useState("");
  const [billRackId, setBillRackId] = useState("");
  const [billRacks, setBillRacks] = useState<Option[]>([]);
  const [billProductSearch, setBillProductSearch] = useState("");
  const [billSearchingProducts, setBillSearchingProducts] = useState(false);
  const [billProductResults, setBillProductResults] = useState<ProductOption[]>([]);

  const [feedback, setFeedback] = useState("");
  const [submittingChallan, setSubmittingChallan] = useState(false);
  const [submittingBill, setSubmittingBill] = useState(false);
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [creatingWarehouse, setCreatingWarehouse] = useState(false);
  const [creatingRack, setCreatingRack] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [newVendorForm, setNewVendorForm] = useState({ ...EMPTY_INLINE_VENDOR_FORM });
  const [newWarehouseForm, setNewWarehouseForm] = useState({ ...EMPTY_INLINE_WAREHOUSE_FORM });
  const [newRackType, setNewRackType] = useState("");
  const [newRackRows, setNewRackRows] = useState("1");
  const [productCreateMode, setProductCreateMode] = useState<"challan" | "bill">("challan");
  const [newProductForm, setNewProductForm] = useState<ProductForm>({ ...EMPTY_PRODUCT_FORM });
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

  async function loadMasters() {
    if (!hasAdminAccessToken()) {
      return;
    }
    try {
      const [vendorsRes, warehousesRes] = await Promise.all([
        fetchBackend("/masters/vendors?page=1&page_size=100"),
        fetchBackend("/masters/warehouses?page=1&page_size=100"),
      ]);
      setVendors(
        asArray(asObject(vendorsRes).items)
          .map((row) => ({
            id: String(row.id ?? ""),
            label: String(row.name ?? row.firm_name ?? "Vendor"),
          }))
          .filter((row) => row.id)
      );
      setWarehouses(
        asArray(asObject(warehousesRes).items)
          .map((row) => ({
            id: String(row.id ?? ""),
            label: `${String(row.name ?? "Warehouse")} (${String(row.code ?? "-")})`,
          }))
          .filter((row) => row.id)
      );
    } catch (error) {
      if (isMissingBearerTokenError(error)) {
        return;
      }
      const message = `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  async function loadProductReferences() {
    if (!hasAdminAccessToken()) {
      return;
    }
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

  async function loadRacksForWarehouse(currentWarehouseId: string, currentRackId = "") {
    if (!currentWarehouseId) {
      setRacks([]);
      setRackId("");
      return;
    }
    if (!hasAdminAccessToken()) {
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", "100");
      params.set("warehouse_id", currentWarehouseId);
      const res = asObject(await fetchBackend(`/masters/racks?${params.toString()}`));
      const rows = asArray(res.items)
        .map((row) => ({
          id: String(row.id ?? ""),
          label: String(row.rack_type ?? `Rack ${String(row.id ?? "").slice(0, 6)}`),
        }))
        .filter((row) => row.id);
      setRacks(rows);
      if (!rows.some((rack) => rack.id === currentRackId)) {
        setRackId("");
      }
    } catch {
      setRacks([]);
    }
  }

  async function loadBillRacksForWarehouse(currentWarehouseId: string, currentRackId = "") {
    if (!currentWarehouseId) {
      setBillRacks([]);
      setBillRackId("");
      return;
    }
    if (!hasAdminAccessToken()) {
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("page_size", "100");
      params.set("warehouse_id", currentWarehouseId);
      const res = asObject(await fetchBackend(`/masters/racks?${params.toString()}`));
      const rows = asArray(res.items)
        .map((row) => ({
          id: String(row.id ?? ""),
          label: String(row.rack_type ?? `Rack ${String(row.id ?? "").slice(0, 6)}`),
        }))
        .filter((row) => row.id);
      setBillRacks(rows);
      if (!rows.some((rack) => rack.id === currentRackId)) {
        setBillRackId("");
      }
    } catch {
      setBillRacks([]);
    }
  }

  async function searchProducts(
    termInput: string,
    setLoading: (value: boolean) => void,
    setResults: (value: ProductOption[]) => void
  ) {
    const term = termInput.trim();
    if (term.length < 3) {
      setResults([]);
      return;
    }
    if (!hasAdminAccessToken()) {
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("include_total", "false");
      params.set("search", term);
      const res = asObject(await fetchBackend(`/masters/products?${params.toString()}`));
      const mapped = asArray(res.items)
        .map((row) => ({
          id: String(row.id ?? ""),
          sku: String(row.sku ?? ""),
          name: String(row.name ?? ""),
          brand: String(row.brand ?? ""),
        }))
        .filter((row) => row.id);
      setResults(mapped);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadChallans() {
    if (!hasAdminAccessToken()) {
      setLoadingChallans(false);
      return;
    }
    setLoadingChallans(true);
    try {
      const res = asArray(await fetchBackend("/procurement/purchase-challans"));
      const mapped = res.map((row) => ({
        id: String(row.id ?? ""),
        reference_no: String(row.reference_no ?? ""),
        vendor_name: String(row.vendor_name ?? ""),
        warehouse_name: String(row.warehouse_name ?? ""),
        items: asArray(row.items).map((item) => ({
          id: String(item.id ?? ""),
          product_id: String(item.product_id ?? ""),
          sku: String(item.sku ?? ""),
          name: String(item.name ?? ""),
          batch_no: String(item.batch_no ?? ""),
          expiry_date: item.expiry_date ? String(item.expiry_date) : null,
          quantity: String(item.quantity ?? "0"),
        })),
      }));
      setChallans(mapped);
    } catch (error) {
      if (isMissingBearerTokenError(error)) {
        return;
      }
      const message = `Challan load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoadingChallans(false);
    }
  }

  async function loadBills() {
    if (!hasAdminAccessToken()) {
      setLoadingBills(false);
      return;
    }
    setLoadingBills(true);
    try {
      const res = asArray(await fetchBackend("/procurement/purchase-bills"));
      setBills(
        res.map((row) => ({
          id: String(row.id ?? ""),
          bill_number: String(row.bill_number ?? ""),
          bill_date: String(row.bill_date ?? ""),
          status: String(row.status ?? ""),
          posted: Boolean(row.posted ?? false),
          challan_reference_no: String(row.challan_reference_no ?? ""),
          vendor_name: String(row.vendor_name ?? ""),
          warehouse_name: String(row.warehouse_name ?? ""),
          entry_mode: String(row.entry_mode ?? "challan") === "direct" ? "direct" : "challan",
          item_count: Number(row.item_count ?? 0),
        }))
      );
    } catch (error) {
      if (isMissingBearerTokenError(error)) {
        return;
      }
      const message = `Bill load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoadingBills(false);
    }
  }

  useEffect(() => {
    if (!hasAdminAccessToken()) {
      setLoadingChallans(false);
      setLoadingBills(false);
      return;
    }
    void loadMasters();
    void loadProductReferences();
    void loadChallans();
    void loadBills();
  }, []);

  useEffect(() => {
    void loadRacksForWarehouse(warehouseId, rackId);
  }, [warehouseId, rackId]);

  useEffect(() => {
    void loadBillRacksForWarehouse(billWarehouseId, billRackId);
  }, [billWarehouseId, billRackId]);

  async function createInlineVendor() {
    if (!newVendorForm.name.trim()) {
      return;
    }
    setCreatingVendor(true);
    try {
      const created = asObject(
        await postBackend("/masters/vendors", {
          name: newVendorForm.name.trim(),
          firm_name: newVendorForm.firm_name.trim() || null,
          gstin: newVendorForm.gstin.trim() || null,
          pan: newVendorForm.pan.trim() || null,
          owner_name: newVendorForm.owner_name.trim() || null,
          phone: newVendorForm.phone.trim() || null,
          alternate_phone: newVendorForm.alternate_phone.trim() || null,
          email: newVendorForm.email.trim() || null,
          street: newVendorForm.street.trim() || null,
          city: newVendorForm.city.trim() || null,
          state: newVendorForm.state.trim() || null,
          pincode: newVendorForm.pincode.trim() || null,
          bank_account_number: newVendorForm.bank_account_number.trim() || null,
          ifsc_code: newVendorForm.ifsc_code.trim() || null,
        })
      );
      await loadMasters();
      const createdId = String(created.id ?? "");
      setVendorId(createdId);
      setBillVendorId(createdId);
      setNewVendorForm({ ...EMPTY_INLINE_VENDOR_FORM });
      setShowVendorCreate(false);
      toast.success(`Added vendor ${String(created.name ?? newVendorForm.name.trim())}.`, { duration: 4000 });
    } catch (error) {
      toast.error(`Vendor create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingVendor(false);
    }
  }

  async function createInlineWarehouse() {
    if (!newWarehouseForm.code.trim() || !newWarehouseForm.name.trim()) {
      return;
    }
    setCreatingWarehouse(true);
    try {
      const created = asObject(
        await postBackend("/masters/warehouses", {
          code: newWarehouseForm.code.trim(),
          name: newWarehouseForm.name.trim(),
          street: newWarehouseForm.street.trim() || null,
          city: newWarehouseForm.city.trim() || null,
          state: newWarehouseForm.state.trim() || null,
          pincode: newWarehouseForm.pincode.trim() || null,
          latitude: newWarehouseForm.latitude.trim() ? Number(newWarehouseForm.latitude) : null,
          longitude: newWarehouseForm.longitude.trim() ? Number(newWarehouseForm.longitude) : null,
        })
      );
      await loadMasters();
      const createdId = String(created.id ?? "");
      setWarehouseId(createdId);
      setBillWarehouseId(createdId);
      setNewWarehouseForm({ ...EMPTY_INLINE_WAREHOUSE_FORM });
      setShowWarehouseCreate(false);
      toast.success(`Added warehouse ${String(created.name ?? newWarehouseForm.name.trim())}.`, { duration: 4000 });
    } catch (error) {
      toast.error(`Warehouse create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingWarehouse(false);
    }
  }

  async function createInlineRack() {
    if (!warehouseId) {
      return;
    }
    const numberOfRows = Number(newRackRows);
    if (!Number.isInteger(numberOfRows) || numberOfRows < 1) {
      toast.error("Number of rows must be at least 1.", { duration: 5000 });
      return;
    }
    setCreatingRack(true);
    try {
      const created = asObject(
        await postBackend("/masters/racks", {
          warehouse_id: warehouseId,
          rack_type: newRackType.trim() || null,
          number_of_rows: numberOfRows,
        })
      );
      await loadRacksForWarehouse(warehouseId, String(created.id ?? ""));
      setRackId(String(created.id ?? ""));
      setNewRackType("");
      setNewRackRows("1");
      setShowRackCreate(false);
      toast.success("Added rack.", { duration: 4000 });
    } catch (error) {
      toast.error(`Rack create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingRack(false);
    }
  }

  async function quickCreateProductMaster() {
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
      await loadProductReferences();
      setQuickCreateType("");
      setQuickName("");
      setQuickCode("");
      setQuickDescription("");
      setQuickGst("0");
      setQuickCategoryId("");
      toast.success("Master created.", { duration: 4000 });
    } catch (error) {
      toast.error(`Create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setQuickCreating(false);
    }
  }

  async function createInlineProduct() {
    if (
      !newProductForm.sku.trim() ||
      !newProductForm.name.trim() ||
      !newProductForm.primary_unit_id ||
      !newProductForm.base_price.trim() ||
      !newProductForm.tax_percent.trim()
    ) {
      return;
    }
    setCreatingProduct(true);
    try {
      const created = asObject(await postBackend("/masters/products", buildProductPayload(newProductForm)));
      const product = {
        id: String(created.id ?? ""),
        sku: String(created.sku ?? newProductForm.sku.trim()),
        name: String(created.name ?? newProductForm.name.trim()),
        brand: brands.find((item) => item.id === newProductForm.brand_id)?.name ?? "",
      };
      if (productCreateMode === "challan") {
        addProduct(product);
        setProductSearch("");
        setProductResults([]);
      } else {
        addBillProduct(product);
      }
      setNewProductForm({ ...EMPTY_PRODUCT_FORM });
      setShowProductCreate(false);
      toast.success(`Added product ${product.name}.`, { duration: 4000 });
    } catch (error) {
      toast.error(`Product create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingProduct(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchProducts(productSearch, setSearchingProducts, setProductResults);
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void searchProducts(billProductSearch, setBillSearchingProducts, setBillProductResults);
    }, 250);
    return () => clearTimeout(timer);
  }, [billProductSearch]);

  useEffect(() => {
    if (billEntryMode !== "challan" || !selectedChallanId) {
      setBillItems([]);
      return;
    }
    const challan = challans.find((row) => row.id === selectedChallanId);
    if (!challan) {
      setBillItems([]);
      return;
    }
    setBillItems(
      challan.items.map((item) => ({
        product_id: item.product_id,
        sku: item.sku,
        name: item.name,
        batch_no: item.batch_no,
        quantity: item.quantity,
        expiry_date: item.expiry_date ?? "",
        damaged_quantity: "0",
        unit_price: "0",
      }))
    );
  }, [billEntryMode, challans, selectedChallanId]);

  useEffect(() => {
    if (billEntryMode === "challan") {
      setBillVendorId("");
      setBillWarehouseId("");
      setBillRackId("");
      setBillProductSearch("");
      setBillProductResults([]);
      return;
    }
    setSelectedChallanId("");
    setBillItems([]);
  }, [billEntryMode]);

  const canCreateChallan = useMemo(() => {
    return Boolean(vendorId && warehouseId && items.length > 0 && items.every((row) => Number(row.quantity) > 0));
  }, [items, vendorId, warehouseId]);
  const normalizedProductSearch = productSearch.trim();
  const showProductNoResults = normalizedProductSearch.length >= 3 && !searchingProducts && productResults.length === 0;
  const normalizedBillProductSearch = billProductSearch.trim();
  const showBillProductNoResults =
    billEntryMode === "direct" && normalizedBillProductSearch.length >= 3 && !billSearchingProducts && billProductResults.length === 0;

  const canCreateBill = useMemo(() => {
    if (!billNumber.trim() || !billDate || billItems.length === 0) {
      return false;
    }
    if (billEntryMode === "challan" && !selectedChallanId) {
      return false;
    }
    if (billEntryMode === "direct" && (!billVendorId || !billWarehouseId)) {
      return false;
    }
    return billItems.every((item) => {
      const quantity = Number(item.quantity);
      const damaged = Number(item.damaged_quantity);
      const unitPrice = Number(item.unit_price);
      return (
        item.batch_no.trim().length > 0 &&
        Number.isFinite(quantity) &&
        quantity >= 0 &&
        Number.isFinite(damaged) &&
        damaged >= 0 &&
        damaged <= quantity &&
        Number.isFinite(unitPrice) &&
        unitPrice >= 0
      );
    });
  }, [billDate, billEntryMode, billItems, billNumber, billVendorId, billWarehouseId, selectedChallanId]);

  const filteredChallans = useMemo(() => {
    const term = challanSearch.trim().toLowerCase();
    if (!term) {
      return challans;
    }
    return challans.filter((row) => {
      return (
        row.reference_no.toLowerCase().includes(term) ||
        row.vendor_name.toLowerCase().includes(term) ||
        row.warehouse_name.toLowerCase().includes(term)
      );
    });
  }, [challans, challanSearch]);

  const filteredBills = useMemo(() => {
    const term = billSearch.trim().toLowerCase();
    if (!term) {
      return bills;
    }
    return bills.filter((row) => {
      return (
        row.bill_number.toLowerCase().includes(term) ||
        row.vendor_name.toLowerCase().includes(term) ||
        row.warehouse_name.toLowerCase().includes(term) ||
        row.challan_reference_no.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term) ||
        row.entry_mode.toLowerCase().includes(term)
      );
    });
  }, [bills, billSearch]);

  const challanTotalPages = Math.max(1, Math.ceil(filteredChallans.length / LIST_PAGE_SIZE));
  const billTotalPages = Math.max(1, Math.ceil(filteredBills.length / LIST_PAGE_SIZE));

  useEffect(() => {
    setChallanPage(1);
  }, [challanSearch]);

  useEffect(() => {
    setBillPage(1);
  }, [billSearch]);

  useEffect(() => {
    if (challanPage > challanTotalPages) {
      setChallanPage(challanTotalPages);
    }
  }, [challanPage, challanTotalPages]);

  useEffect(() => {
    if (billPage > billTotalPages) {
      setBillPage(billTotalPages);
    }
  }, [billPage, billTotalPages]);

  const challanPageRows = useMemo(() => {
    const start = (challanPage - 1) * LIST_PAGE_SIZE;
    return filteredChallans.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredChallans, challanPage]);

  const billPageRows = useMemo(() => {
    const start = (billPage - 1) * LIST_PAGE_SIZE;
    return filteredBills.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredBills, billPage]);

  function addProduct(product: ProductOption) {
    setItems((prev) => {
      const existing = prev.find((row) => row.product_id === product.id);
      if (existing) {
        return prev.map((row) =>
          row.product_id === product.id ? { ...row, quantity: String(Number(row.quantity || "0") + 1) } : row
        );
      }
      return [...prev, { product_id: product.id, sku: product.sku, name: product.name, quantity: "1", expiry_date: "" }];
    });
  }

  function removeItem(productId: string) {
    setItems((prev) => prev.filter((row) => row.product_id !== productId));
  }

  function addBillProduct(product: ProductOption) {
    setBillItems((prev) => {
      const existingIndex = prev.findIndex((row) => row.product_id === product.id);
      if (existingIndex >= 0) {
        return prev.map((row, index) =>
          index === existingIndex ? { ...row, quantity: String(Number(row.quantity || "0") + 1) } : row
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          sku: product.sku,
          name: product.name,
          batch_no: createBillBatchNo(billDate, prev.length),
          expiry_date: "",
          quantity: "1",
          damaged_quantity: "0",
          unit_price: "0",
        },
      ];
    });
    setBillProductSearch("");
    setBillProductResults([]);
  }

  function removeBillItem(indexToRemove: number) {
    setBillItems((prev) => prev.filter((_, index) => index !== indexToRemove));
  }

  async function createChallanWithItems() {
    if (submittingChallan) {
      return;
    }
    if (!vendorId || !warehouseId) {
      const message = "Vendor and warehouse are mandatory to create purchase challan.";
      setFeedback(message);
      toast.error(message, { duration: 5000 });
      return;
    }
    if (!canCreateChallan) {
      return;
    }
    setSubmittingChallan(true);
    setFeedback("");
    try {
      await postBackend("/procurement/purchase-challans", {
        vendor_id: vendorId,
        warehouse_id: warehouseId,
        rack_id: rackId || null,
        reference_no: referenceNo,
        items: items.map((row) => ({
          product_id: row.product_id,
          quantity: Number(row.quantity),
          expiry_date: row.expiry_date || null,
        })),
      });
      toast.success("Purchase challan and items created.", { duration: 5000 });
      setFeedback("Purchase challan and items created.");
      setItems([]);
      setProductSearch("");
      setProductResults([]);
      setReferenceNo(createReferenceNo());
      await loadChallans();
      setShowNewChallan(false);
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSubmittingChallan(false);
    }
  }

  async function createPurchaseBill() {
    if (!canCreateBill || submittingBill) {
      return;
    }
    setSubmittingBill(true);
    setFeedback("");
    try {
      await postBackend("/procurement/purchase-bills", {
        challan_id: billEntryMode === "challan" ? selectedChallanId : null,
        vendor_id: billEntryMode === "direct" ? billVendorId : null,
        warehouse_id: billEntryMode === "direct" ? billWarehouseId : null,
        rack_id: billEntryMode === "direct" ? billRackId || null : null,
        bill_number: billNumber,
        bill_date: billDate,
        items: billItems.map((item) => ({
          product_id: item.product_id,
          batch_no: item.batch_no,
          expiry_date: item.expiry_date || null,
          quantity: Number(item.quantity),
          damaged_quantity: Number(item.damaged_quantity),
          unit_price: Number(item.unit_price),
        })),
      });
      toast.success("Purchase bill created and stock adjusted.", { duration: 5000 });
      setFeedback("Purchase bill created and stock adjusted.");
      setSelectedChallanId("");
      setBillItems([]);
      setBillVendorId("");
      setBillWarehouseId("");
      setBillRackId("");
      setBillProductSearch("");
      setBillProductResults([]);
      setBillEntryMode("direct");
      setBillNumber(createBillNo());
      setBillDate(new Date().toISOString().slice(0, 10));
      await loadChallans();
      await loadBills();
      setShowNewBill(false);
    } catch (error) {
      const message = `Bill create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSubmittingBill(false);
    }
  }

  return (
    <>
    <Tabs defaultValue="challan" className="w-full">
      <TabsList>
        <TabsTrigger value="challan">Purchase Challan</TabsTrigger>
        <TabsTrigger value="bill">Purchase Bill</TabsTrigger>
      </TabsList>

      <TabsContent value="challan">
        <Card>
          <CardHeader>
            <CardTitle>Purchase Challan Entry</CardTitle>
            <CardDescription>Available challans are listed first. Click create new to open entry form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback ? <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{feedback}</p> : null}
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">Available Challans</p>
              <div className="flex w-full gap-2 md:w-auto">
                <Input
                  placeholder="Search challan, vendor, warehouse"
                  value={challanSearch}
                  onChange={(e) => setChallanSearch(e.target.value)}
                  className="md:w-80"
                />
                <Dialog open={showNewChallan} onOpenChange={setShowNewChallan}>
                  <DialogTrigger asChild>
                    <Button>Create New</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] w-[75vw] max-w-[1080px] sm:max-w-[1080px] overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                    <DialogHeader>
                      <DialogTitle>Create Purchase Challan</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label>Vendor *</Label>
                            <Dialog open={showVendorCreate} onOpenChange={setShowVendorCreate}>
                              <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm">
                                  + Add Vendor
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Add Vendor</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>Name *</Label>
                                    <Input
                                      value={newVendorForm.name}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, name: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Firm Name</Label>
                                    <Input
                                      value={newVendorForm.firm_name}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, firm_name: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>GSTIN</Label>
                                    <Input
                                      value={newVendorForm.gstin}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, gstin: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>PAN</Label>
                                    <Input
                                      value={newVendorForm.pan}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, pan: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Owner Name</Label>
                                    <Input
                                      value={newVendorForm.owner_name}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Phone</Label>
                                    <Input
                                      value={newVendorForm.phone}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, phone: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Alternate Phone</Label>
                                    <Input
                                      value={newVendorForm.alternate_phone}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, alternate_phone: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Email</Label>
                                    <Input
                                      value={newVendorForm.email}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, email: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1 md:col-span-2">
                                    <Label>Street</Label>
                                    <Input
                                      value={newVendorForm.street}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, street: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>City</Label>
                                    <Input
                                      value={newVendorForm.city}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, city: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>State</Label>
                                    <Input
                                      value={newVendorForm.state}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, state: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Pincode</Label>
                                    <Input
                                      value={newVendorForm.pincode}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, pincode: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Bank Account Number</Label>
                                    <Input
                                      value={newVendorForm.bank_account_number}
                                      onChange={(e) =>
                                        setNewVendorForm((prev) => ({ ...prev, bank_account_number: e.target.value }))
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>IFSC Code</Label>
                                    <Input
                                      value={newVendorForm.ifsc_code}
                                      onChange={(e) => setNewVendorForm((prev) => ({ ...prev, ifsc_code: e.target.value }))}
                                    />
                                  </div>
                                </div>
                                <div className="pt-2">
                                  <Button onClick={createInlineVendor} disabled={creatingVendor || !newVendorForm.name.trim()}>
                                    {creatingVendor ? "Adding..." : "Add Vendor"}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <select
                            className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={vendorId}
                            onChange={(e) => setVendorId(e.target.value)}
                          >
                            <option value="">{vendors.length ? "Select vendor" : "No vendors found"}</option>
                            {vendors.map((vendor) => (
                              <option key={vendor.id} value={vendor.id}>
                                {vendor.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label>Warehouse *</Label>
                            <Dialog open={showWarehouseCreate} onOpenChange={setShowWarehouseCreate}>
                              <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm">
                                  + Add Warehouse
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                                <DialogHeader>
                                  <DialogTitle>Add Warehouse</DialogTitle>
                                </DialogHeader>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>Code *</Label>
                                    <Input
                                      value={newWarehouseForm.code}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, code: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Name *</Label>
                                    <Input
                                      value={newWarehouseForm.name}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, name: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Street</Label>
                                    <Input
                                      value={newWarehouseForm.street}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, street: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>City</Label>
                                    <Input
                                      value={newWarehouseForm.city}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, city: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>State</Label>
                                    <Input
                                      value={newWarehouseForm.state}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, state: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Pincode</Label>
                                    <Input
                                      value={newWarehouseForm.pincode}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, pincode: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Latitude</Label>
                                    <Input
                                      value={newWarehouseForm.latitude}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, latitude: e.target.value }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Longitude</Label>
                                    <Input
                                      value={newWarehouseForm.longitude}
                                      onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, longitude: e.target.value }))}
                                    />
                                  </div>
                                </div>
                                <div className="pt-2">
                                  <Button
                                    onClick={createInlineWarehouse}
                                    disabled={creatingWarehouse || !newWarehouseForm.code.trim() || !newWarehouseForm.name.trim()}
                                  >
                                    {creatingWarehouse ? "Adding..." : "Add Warehouse"}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <select
                            className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={warehouseId}
                            onChange={(e) => setWarehouseId(e.target.value)}
                          >
                            <option value="">{warehouses.length ? "Select warehouse" : "No warehouses found"}</option>
                            {warehouses.map((warehouse) => (
                              <option key={warehouse.id} value={warehouse.id}>
                                {warehouse.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label>Rack (Optional)</Label>
                            <Dialog open={showRackCreate} onOpenChange={setShowRackCreate}>
                              <DialogTrigger asChild>
                                <Button type="button" variant="outline" size="sm" disabled={!warehouseId}>
                                  + Add Rack
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Add Rack</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-3">
                                  {!warehouseId ? (
                                    <p className="text-sm text-muted-foreground">Select a warehouse first.</p>
                                  ) : (
                                    <>
                                      <div className="space-y-1">
                                        <Label>Rack Type</Label>
                                        <Input value={newRackType} onChange={(e) => setNewRackType(e.target.value)} />
                                      </div>
                                      <div className="space-y-1">
                                        <Label>Number of Rows *</Label>
                                        <Input value={newRackRows} onChange={(e) => setNewRackRows(e.target.value)} />
                                      </div>
                                      <Button onClick={createInlineRack} disabled={creatingRack}>
                                        {creatingRack ? "Adding..." : "Add Rack"}
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <select
                            className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                            value={rackId}
                            onChange={(e) => setRackId(e.target.value)}
                            disabled={!warehouseId}
                          >
                            <option value="">{warehouseId ? "Select rack (optional)" : "Select warehouse first"}</option>
                            {racks.map((rack) => (
                              <option key={rack.id} value={rack.id}>
                                {rack.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label>Reference No</Label>
                          <Input value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Product Search</Label>
                        <div className="flex gap-2">
                          <Input
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="Type first 3 letters of SKU, name or brand"
                          />
                          <Button type="button" variant="outline" onClick={() => { setProductCreateMode("challan"); setShowProductCreate(true); }}>
                            + Add Product
                          </Button>
                        </div>
                        {productSearch.trim().length > 0 && productSearch.trim().length < 3 ? (
                          <p className="text-xs text-muted-foreground">Enter at least 3 letters.</p>
                        ) : null}
                        {searchingProducts ? <p className="text-xs text-muted-foreground">Searching products...</p> : null}
                        {productResults.length > 0 ? (
                          <div className="max-h-56 overflow-y-auto rounded-md border">
                            {productResults.map((product) => (
                              <div key={product.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{product.sku || "-"}</p>
                                  <p className="truncate text-xs text-muted-foreground">
                                    {product.name || "-"}{product.brand ? ` • ${product.brand}` : ""}
                                  </p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => addProduct(product)}>
                                  Add
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {showProductNoResults ? (
                          <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No results found.</p>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label>Selected Items</Label>
                        {items.length === 0 ? (
                          <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No products added yet.</p>
                        ) : (
                          <div className="space-y-2">
                            {items.map((row, index) => (
                              <div key={row.product_id} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-12 md:items-end">
                                <div className="md:col-span-2">
                                  <p className="text-xs text-muted-foreground">SKU</p>
                                  <p className="font-medium">{row.sku || "-"}</p>
                                </div>
                                <div className="md:col-span-3">
                                  <p className="text-xs text-muted-foreground">Name</p>
                                  <p className="font-medium">{row.name || "-"}</p>
                                </div>
                                <div className="md:col-span-2">
                                  <p className="text-xs text-muted-foreground">Batch No (Auto)</p>
                                  <p className="font-mono text-xs">{challanBatchPreview(index)}</p>
                                </div>
                                <div className="md:col-span-2">
                                  <p className="mb-1 text-xs text-muted-foreground">Expiry Date</p>
                                  <Input
                                    type="date"
                                    value={row.expiry_date}
                                    onChange={(e) =>
                                      setItems((prev) =>
                                        prev.map((item) =>
                                          item.product_id === row.product_id ? { ...item, expiry_date: e.target.value } : item
                                        )
                                      )
                                    }
                                  />
                                </div>
                                <div className="md:col-span-1">
                                  <p className="mb-1 text-xs text-muted-foreground">Quantity</p>
                                  <Input
                                    value={row.quantity}
                                    onChange={(e) =>
                                      setItems((prev) =>
                                        prev.map((item) =>
                                          item.product_id === row.product_id ? { ...item, quantity: e.target.value } : item
                                        )
                                      )
                                    }
                                  />
                                </div>
                                <div className="md:col-span-2">
                                  <p className="mb-1 text-xs text-muted-foreground">Action</p>
                                  <Button size="sm" variant="outline" onClick={() => removeItem(row.product_id)}>
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <Button onClick={createChallanWithItems} disabled={!canCreateChallan || submittingChallan}>
                        {submittingChallan ? "Creating..." : "Create Purchase Challan"}
                      </Button>
                      {!vendorId || !warehouseId ? (
                        <p className="text-xs text-muted-foreground">Select vendor and warehouse to enable challan creation.</p>
                      ) : null}
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-left">Warehouse</th>
                    <th className="px-3 py-2 text-left">Items</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingChallans ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`challan-skeleton-${index}`} className="border-t">
                        <td className="px-3 py-2"><Skeleton className="h-5 w-40" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-48" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-44" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-8" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-16" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-8 w-14" /></td>
                      </tr>
                    ))
                  ) : filteredChallans.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-muted-foreground">
                        No challans found.
                      </td>
                    </tr>
                  ) : (
                    challanPageRows.map((challan) => (
                      <tr key={challan.id} className="border-t">
                        <td className="px-3 py-2">{challan.reference_no}</td>
                        <td className="px-3 py-2">{challan.vendor_name}</td>
                        <td className="px-3 py-2">{challan.warehouse_name}</td>
                        <td className="px-3 py-2">{challan.items.length}</td>
                        <td className="px-3 py-2">Created</td>
                        <td className="px-3 py-2">
                          <Button size="sm" variant="outline" onClick={() => setPreviewChallan(challan)}>
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Dialog open={Boolean(previewChallan)} onOpenChange={(open) => !open && setPreviewChallan(null)}>
              <DialogContent className="max-h-[90vh] w-[75vw] max-w-[1080px] sm:max-w-[1080px] overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                <DialogHeader>
                  <DialogTitle>Challan Details</DialogTitle>
                </DialogHeader>
                {previewChallan ? (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      <p>Reference: <span className="font-medium text-foreground">{previewChallan.reference_no}</span></p>
                      <p>Vendor: <span className="font-medium text-foreground">{previewChallan.vendor_name || "-"}</span></p>
                      <p>Warehouse: <span className="font-medium text-foreground">{previewChallan.warehouse_name || "-"}</span></p>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="px-3 py-2 text-left">SKU</th>
                            <th className="px-3 py-2 text-left">Name</th>
                            <th className="px-3 py-2 text-left">Batch</th>
                            <th className="px-3 py-2 text-left">Expiry</th>
                            <th className="px-3 py-2 text-left">Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewChallan.items.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-3 py-2 text-muted-foreground">
                                No items in this challan.
                              </td>
                            </tr>
                          ) : (
                            previewChallan.items.map((item) => (
                              <tr key={item.id} className="border-t">
                                <td className="px-3 py-2">{item.sku || "-"}</td>
                                <td className="px-3 py-2">{item.name || "-"}</td>
                                <td className="px-3 py-2">{item.batch_no || "-"}</td>
                                <td className="px-3 py-2">{item.expiry_date || "-"}</td>
                                <td className="px-3 py-2">{item.quantity || "0"}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </DialogContent>
            </Dialog>

            {!loadingChallans && filteredChallans.length > LIST_PAGE_SIZE ? (
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setChallanPage(1)} disabled={challanPage <= 1}>
                  First
                </Button>
                <Button size="sm" variant="outline" onClick={() => setChallanPage((p) => p - 1)} disabled={challanPage <= 1}>
                  Previous
                </Button>
                <span className="px-1 text-sm text-muted-foreground">
                  Page {challanPage} of {challanTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setChallanPage((p) => p + 1)}
                  disabled={challanPage >= challanTotalPages}
                >
                  Next
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setChallanPage(challanTotalPages)}
                  disabled={challanPage >= challanTotalPages}
                >
                  Last
                </Button>
              </div>
            ) : null}

          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="bill">
        <Card>
          <CardHeader>
            <CardTitle>Purchase Bill</CardTitle>
            <CardDescription>Available bills are listed first. Click create new to open bill form.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback ? <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{feedback}</p> : null}
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">Available Bills</p>
              <div className="flex w-full gap-2 md:w-auto">
                <Input
                  placeholder="Search bill no, vendor, warehouse, challan ref, status"
                  value={billSearch}
                  onChange={(e) => setBillSearch(e.target.value)}
                  className="md:w-80"
                />
                <Dialog open={showNewBill} onOpenChange={setShowNewBill}>
                  <DialogTrigger asChild>
                    <Button>Create New</Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] w-[75vw] max-w-[1080px] sm:max-w-[1080px] overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                    <DialogHeader>
                      <DialogTitle>Create Purchase Bill</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Tabs
                        value={billEntryMode}
                        onValueChange={(value) => setBillEntryMode(value === "direct" ? "direct" : "challan")}
                        className="w-full"
                      >
                        <TabsList>
                          <TabsTrigger value="challan">From Challan</TabsTrigger>
                          <TabsTrigger value="direct">Direct Bill</TabsTrigger>
                        </TabsList>
                        <TabsContent value="challan" className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-3">
                            <div className="space-y-1 md:col-span-2">
                              <Label>Purchase Challan *</Label>
                              <select
                                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={selectedChallanId}
                                onChange={(e) => setSelectedChallanId(e.target.value)}
                              >
                                <option value="">{challans.length ? "Select challan" : "No challans found"}</option>
                                {challans.map((challan) => (
                                  <option key={challan.id} value={challan.id}>
                                    {challan.reference_no} - {challan.vendor_name} - {challan.warehouse_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label>Bill Date *</Label>
                              <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-3">
                              <Label>Bill Number *</Label>
                              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
                            </div>
                          </div>
                          {billItems.length > 0 ? (
                            <div className="space-y-2">
                              {billItems.map((row, index) => (
                                <div key={`${row.product_id}-${row.batch_no}-${index}`} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-12 md:items-end">
                                  <div className="md:col-span-2">
                                    <p className="text-xs text-muted-foreground">SKU</p>
                                    <p className="font-medium">{row.sku || "-"}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="text-xs text-muted-foreground">Name</p>
                                    <p className="font-medium">{row.name || "-"}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="text-xs text-muted-foreground">Batch</p>
                                    <p className="font-medium">{row.batch_no || "-"}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="mb-1 text-xs text-muted-foreground">Expiry Date</p>
                                    <Input
                                      type="date"
                                      value={row.expiry_date}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, expiry_date: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <p className="mb-1 text-xs text-muted-foreground">Received Qty</p>
                                    <Input
                                      value={row.quantity}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, quantity: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <p className="mb-1 text-xs text-muted-foreground">Damaged Qty</p>
                                    <Input
                                      value={row.damaged_quantity}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, damaged_quantity: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="mb-1 text-xs text-muted-foreground">Unit Price</p>
                                    <Input
                                      value={row.unit_price}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, unit_price: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                              Select a purchase challan to load items for bill creation.
                            </p>
                          )}
                        </TabsContent>
                        <TabsContent value="direct" className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label>Vendor *</Label>
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowVendorCreate(true)}>
                                  + Add Vendor
                                </Button>
                              </div>
                              <select
                                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={billVendorId}
                                onChange={(e) => setBillVendorId(e.target.value)}
                              >
                                <option value="">{vendors.length ? "Select vendor" : "No vendors found"}</option>
                                {vendors.map((vendor) => (
                                  <option key={vendor.id} value={vendor.id}>
                                    {vendor.label}
                                  </option>
                                ))}
                              </select>
                              <Dialog open={showVendorCreate} onOpenChange={setShowVendorCreate}>
                                <DialogContent className="sm:max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Add Vendor</DialogTitle>
                                  </DialogHeader>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label>Name *</Label>
                                      <Input
                                        value={newVendorForm.name}
                                        onChange={(e) => setNewVendorForm((prev) => ({ ...prev, name: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Firm Name</Label>
                                      <Input
                                        value={newVendorForm.firm_name}
                                        onChange={(e) => setNewVendorForm((prev) => ({ ...prev, firm_name: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>GSTIN</Label>
                                      <Input
                                        value={newVendorForm.gstin}
                                        onChange={(e) => setNewVendorForm((prev) => ({ ...prev, gstin: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>PAN</Label>
                                      <Input value={newVendorForm.pan} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, pan: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Owner Name</Label>
                                      <Input
                                        value={newVendorForm.owner_name}
                                        onChange={(e) => setNewVendorForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Phone</Label>
                                      <Input value={newVendorForm.phone} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, phone: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Alternate Phone</Label>
                                      <Input
                                        value={newVendorForm.alternate_phone}
                                        onChange={(e) => setNewVendorForm((prev) => ({ ...prev, alternate_phone: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Email</Label>
                                      <Input value={newVendorForm.email} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, email: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                      <Label>Street</Label>
                                      <Input value={newVendorForm.street} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, street: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>City</Label>
                                      <Input value={newVendorForm.city} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, city: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>State</Label>
                                      <Input value={newVendorForm.state} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, state: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Pincode</Label>
                                      <Input value={newVendorForm.pincode} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, pincode: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Bank Account Number</Label>
                                      <Input
                                        value={newVendorForm.bank_account_number}
                                        onChange={(e) => setNewVendorForm((prev) => ({ ...prev, bank_account_number: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                      <Label>IFSC Code</Label>
                                      <Input value={newVendorForm.ifsc_code} onChange={(e) => setNewVendorForm((prev) => ({ ...prev, ifsc_code: e.target.value }))} />
                                    </div>
                                  </div>
                                  <div className="pt-2">
                                    <Button onClick={createInlineVendor} disabled={creatingVendor || !newVendorForm.name.trim()}>
                                      {creatingVendor ? "Adding..." : "Add Vendor"}
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <Label>Warehouse *</Label>
                                <Button type="button" variant="outline" size="sm" onClick={() => setShowWarehouseCreate(true)}>
                                  + Add Warehouse
                                </Button>
                              </div>
                              <select
                                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={billWarehouseId}
                                onChange={(e) => setBillWarehouseId(e.target.value)}
                              >
                                <option value="">{warehouses.length ? "Select warehouse" : "No warehouses found"}</option>
                                {warehouses.map((warehouse) => (
                                  <option key={warehouse.id} value={warehouse.id}>
                                    {warehouse.label}
                                  </option>
                                ))}
                              </select>
                              <Dialog open={showWarehouseCreate} onOpenChange={setShowWarehouseCreate}>
                                <DialogContent className="sm:max-w-md">
                                  <DialogHeader>
                                    <DialogTitle>Add Warehouse</DialogTitle>
                                  </DialogHeader>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label>Code *</Label>
                                      <Input
                                        value={newWarehouseForm.code}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, code: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Name *</Label>
                                      <Input
                                        value={newWarehouseForm.name}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, name: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                      <Label>Street</Label>
                                      <Input
                                        value={newWarehouseForm.street}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, street: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>City</Label>
                                      <Input
                                        value={newWarehouseForm.city}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, city: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>State</Label>
                                      <Input
                                        value={newWarehouseForm.state}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, state: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Pincode</Label>
                                      <Input
                                        value={newWarehouseForm.pincode}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, pincode: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Latitude</Label>
                                      <Input
                                        value={newWarehouseForm.latitude}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, latitude: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>Longitude</Label>
                                      <Input
                                        value={newWarehouseForm.longitude}
                                        onChange={(e) => setNewWarehouseForm((prev) => ({ ...prev, longitude: e.target.value }))}
                                      />
                                    </div>
                                  </div>
                                  <div className="pt-2">
                                    <Button
                                      onClick={createInlineWarehouse}
                                      disabled={creatingWarehouse || !newWarehouseForm.code.trim() || !newWarehouseForm.name.trim()}
                                    >
                                      {creatingWarehouse ? "Adding..." : "Add Warehouse"}
                                    </Button>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                            <div className="space-y-1">
                              <Label>Rack</Label>
                              <select
                                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                                value={billRackId}
                                onChange={(e) => setBillRackId(e.target.value)}
                                disabled={!billWarehouseId}
                              >
                                <option value="">{billWarehouseId ? "Select rack (optional)" : "Select warehouse first"}</option>
                                {billRacks.map((rack) => (
                                  <option key={rack.id} value={rack.id}>
                                    {rack.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label>Bill Date *</Label>
                              <Input type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label>Bill Number *</Label>
                              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Add Products *</Label>
                            <div className="flex gap-2">
                              <Input
                                value={billProductSearch}
                                onChange={(e) => setBillProductSearch(e.target.value)}
                                placeholder="Type first 3 letters of SKU, name or brand"
                              />
                              <Button type="button" variant="outline" onClick={() => { setProductCreateMode("bill"); setShowProductCreate(true); }}>
                                + Add Product
                              </Button>
                            </div>
                            {normalizedBillProductSearch.length > 0 && normalizedBillProductSearch.length < 3 ? (
                              <p className="text-xs text-muted-foreground">Enter at least 3 letters.</p>
                            ) : null}
                            {billSearchingProducts ? <p className="text-xs text-muted-foreground">Searching products...</p> : null}
                            {billProductResults.length > 0 ? (
                              <div className="max-h-56 overflow-y-auto rounded-md border">
                                {billProductResults.map((product) => (
                                  <div key={product.id} className="flex items-center justify-between border-b px-3 py-2 last:border-b-0">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{product.sku || "-"}</p>
                                      <p className="truncate text-xs text-muted-foreground">
                                        {product.name || "-"}{product.brand ? ` • ${product.brand}` : ""}
                                      </p>
                                    </div>
                                    <Button size="sm" variant="outline" onClick={() => addBillProduct(product)}>
                                      Add
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {showBillProductNoResults ? (
                              <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">No results found.</p>
                            ) : null}
                          </div>

                          {billItems.length > 0 ? (
                            <div className="space-y-2">
                              {billItems.map((row, index) => (
                                <div key={`${row.product_id}-${index}`} className="grid gap-2 rounded-md border p-3 text-sm md:grid-cols-12 md:items-end">
                                  <div className="md:col-span-2">
                                    <p className="text-xs text-muted-foreground">SKU</p>
                                    <p className="font-medium">{row.sku || "-"}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="text-xs text-muted-foreground">Name</p>
                                    <p className="font-medium">{row.name || "-"}</p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="mb-1 text-xs text-muted-foreground">Batch *</p>
                                    <Input
                                      value={row.batch_no}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, batch_no: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="mb-1 text-xs text-muted-foreground">Expiry Date</p>
                                    <Input
                                      type="date"
                                      value={row.expiry_date}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, expiry_date: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <p className="mb-1 text-xs text-muted-foreground">Received Qty *</p>
                                    <Input
                                      value={row.quantity}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, quantity: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <p className="mb-1 text-xs text-muted-foreground">Damaged Qty</p>
                                    <Input
                                      value={row.damaged_quantity}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, damaged_quantity: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <p className="mb-1 text-xs text-muted-foreground">Unit Price *</p>
                                    <Input
                                      value={row.unit_price}
                                      onChange={(e) =>
                                        setBillItems((prev) =>
                                          prev.map((item, idx) => (idx === index ? { ...item, unit_price: e.target.value } : item))
                                        )
                                      }
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <p className="mb-1 text-xs text-muted-foreground">Action</p>
                                    <Button size="sm" variant="outline" onClick={() => removeBillItem(index)}>
                                      Remove
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                              Search and add products to create a direct purchase bill.
                            </p>
                          )}
                        </TabsContent>
                      </Tabs>

                      <Button onClick={createPurchaseBill} disabled={!canCreateBill || submittingBill}>
                        {submittingBill ? "Creating..." : "Create Purchase Bill"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-[820px] w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-3 py-2 text-left">Bill No</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-left">Warehouse</th>
                    <th className="px-3 py-2 text-left">Mode</th>
                    <th className="px-3 py-2 text-left">Challan Ref</th>
                    <th className="px-3 py-2 text-left">Items</th>
                    <th className="px-3 py-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBills ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={`bill-skeleton-${index}`} className="border-t">
                        <td className="px-3 py-2"><Skeleton className="h-5 w-24" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-28" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-48" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-40" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-16" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-36" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-8" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-16" /></td>
                      </tr>
                    ))
                  ) : filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-2 text-muted-foreground">
                        No bills found.
                      </td>
                    </tr>
                  ) : (
                    billPageRows.map((bill) => (
                      <tr key={bill.id} className="border-t">
                        <td className="px-3 py-2">{bill.bill_number}</td>
                        <td className="px-3 py-2">{bill.bill_date}</td>
                        <td className="px-3 py-2">{bill.vendor_name || "-"}</td>
                        <td className="px-3 py-2">{bill.warehouse_name || "-"}</td>
                        <td className="px-3 py-2">{bill.entry_mode === "direct" ? "Direct" : "Challan"}</td>
                        <td className="px-3 py-2">{bill.challan_reference_no || "-"}</td>
                        <td className="px-3 py-2">{bill.item_count}</td>
                        <td className="px-3 py-2">{bill.posted ? "Posted" : bill.status}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {!loadingBills && filteredBills.length > LIST_PAGE_SIZE ? (
              <div className="flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setBillPage(1)} disabled={billPage <= 1}>
                  First
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBillPage((p) => p - 1)} disabled={billPage <= 1}>
                  Previous
                </Button>
                <span className="px-1 text-sm text-muted-foreground">
                  Page {billPage} of {billTotalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBillPage((p) => p + 1)}
                  disabled={billPage >= billTotalPages}
                >
                  Next
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBillPage(billTotalPages)}
                  disabled={billPage >= billTotalPages}
                >
                  Last
                </Button>
              </div>
            ) : null}

          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog open={showProductCreate} onOpenChange={setShowProductCreate}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
        </DialogHeader>
        <ProductFormFields
          form={newProductForm}
          setForm={setNewProductForm}
          brands={brands}
          categories={categories}
          subCategories={subCategories}
          units={units}
          hsnOptions={hsnOptions}
          onQuickCreate={(type) => setQuickCreateType(type)}
        />
        <div className="pt-2">
          <Button
            onClick={createInlineProduct}
            disabled={
              creatingProduct ||
              !newProductForm.sku.trim() ||
              !newProductForm.name.trim() ||
              !newProductForm.primary_unit_id ||
              !newProductForm.base_price.trim() ||
              !newProductForm.tax_percent.trim()
            }
          >
            {creatingProduct ? "Creating..." : "Create Product"}
          </Button>
        </div>
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
        <div className="pt-2">
          <Button
            onClick={quickCreateProductMaster}
            disabled={
              quickCreating ||
              ((quickCreateType === "brand" || quickCreateType === "category" || quickCreateType === "subCategory" || quickCreateType === "unit") &&
                !quickName.trim()) ||
              ((quickCreateType === "unit" || quickCreateType === "hsn") && !quickCode.trim())
            }
          >
            {quickCreating ? "Saving..." : "Create"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
