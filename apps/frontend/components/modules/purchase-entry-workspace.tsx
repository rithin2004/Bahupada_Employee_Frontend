"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, fetchBackendFresh, patchBackend, postBackend } from "@/lib/backend-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type WarehouseOption = { id: string; name: string; code: string; state: string | null };
type LookupOption = { id: string; name: string };
type SubCategoryOption = LookupOption & { category_id?: string };
type AccountCategoryOption = { id: string; code: string; name: string };
type VendorSummary = {
  vendor_id: string;
  vendor_name: string;
  address_lines: string[];
  brand_names: string[];
  purchase_type: "LOCAL" | "CENTRAL" | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  route: string | null;
  annual_purchase_amount: string;
  monthly_purchase_amount: string;
  balance: string;
  balance_side: string;
  last_purchase_date: string | null;
  last_payment_date: string | null;
  last_bills: Array<{ bill_number: string; bill_date: string; total_amount: string }>;
  open_challans: Array<{ challan_id: string; reference_no: string; challan_date: string | null; item_count: number }>;
};

type ProductSummary = {
  product_id: string;
  sku: string;
  name: string;
  brand: string | null;
  description: string | null;
  hsn_code: string | null;
  tax_percent: string;
  mrp: string;
  cost_price: string;
  unit_1st_name: string | null;
  unit_2nd_name: string | null;
  unit_3rd_name: string | null;
  unit_1st_id: string | null;
  unit_2nd_id: string | null;
  unit_3rd_id: string | null;
  conv_2_to_1: string | null;
  conv_3_to_2: string | null;
  conv_3_to_1: string | null;
  stock_base_quantity: string;
  stock_ratio: string;
  latest_rate_value: string | null;
  latest_rate_unit_level: number | null;
  latest_discount_percent: string | null;
  recent_bills: Array<{ bill_number: string; bill_date: string; line_total_amount: string }>;
};

type LedgerEntry = {
  entry_id: string;
  entry_date: string;
  description: string;
  admin_debit: string;
  admin_credit: string;
  running_balance: string;
  balance_side: string;
};

type ProductEditForm = {
  sku: string;
  name: string;
  description: string;
  hsn_id: string;
  primary_unit_id: string;
  secondary_unit_id: string;
  third_unit_id: string;
  secondary_unit_quantity: string;
  third_unit_quantity: string;
  weight_in_grams: string;
  tax_percent: string;
};

type UnitOption = { id: string; unit_code: string; unit_name: string };
type HsnOption = { id: string; hsn_code: string; gst_percent: string };
type VendorCreateForm = {
  firm_name: string;
  brand_ids: string[];
  purchase_type: "LOCAL" | "CENTRAL";
  gstin: string;
  pan: string;
  owner_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  pincode: string;
  bank_account_number: string;
  ifsc_code: string;
  account_category_id: string;
};
type ProductCreateForm = {
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
  tax_percent: string;
};

type LineDraft = {
  id: string;
  product: ProductSummary | null;
  quantity1: string;
  quantity2: string;
  quantity3: string;
  mrp: string;
  rateValue: string;
  rateUnitLevel: 1 | 2 | 3;
  discountPercent: string;
  discountLumpsum: string;
  amount: string;
};

const EMPTY_PRODUCT_EDIT: ProductEditForm = {
  sku: "",
  name: "",
  description: "",
  hsn_id: "",
  primary_unit_id: "",
  secondary_unit_id: "",
  third_unit_id: "",
  secondary_unit_quantity: "",
  third_unit_quantity: "",
  weight_in_grams: "",
  tax_percent: "",
};
const EMPTY_VENDOR_FORM: VendorCreateForm = {
  firm_name: "",
  brand_ids: [],
  purchase_type: "CENTRAL",
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
  account_category_id: "",
};
const EMPTY_PRODUCT_FORM: ProductCreateForm = {
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
  tax_percent: "",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDisplayDate(iso: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}-${m}-${y}` : iso;
}

function parseDateInput(input: string): string | null {
  const trimmed = input.replace(/[^0-9]/g, "");
  if (trimmed.length !== 8) {
    return null;
  }
  const dd = trimmed.slice(0, 2);
  const mm = trimmed.slice(2, 4);
  const yyyy = trimmed.slice(4, 8);
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function asDecimal(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function makeLine(): LineDraft {
  return {
    id: crypto.randomUUID(),
    product: null,
    quantity1: "",
    quantity2: "",
    quantity3: "",
    mrp: "",
    rateValue: "",
    rateUnitLevel: 1,
    discountPercent: "",
    discountLumpsum: "",
    amount: "0.00",
  };
}

type LineField = "product" | "quantity1" | "quantity2" | "quantity3" | "mrp" | "rateValue" | "rateUnitLevel" | "discountPercent" | "discountLumpsum";
const LINE_FIELD_ORDER: LineField[] = ["product", "quantity3", "quantity2", "quantity1", "mrp", "rateValue", "rateUnitLevel", "discountPercent", "discountLumpsum"];
const PAYMENT_MODE_OPTIONS: Array<"CREDIT" | "CASH"> = ["CREDIT", "CASH"];
const VENDOR_CREATE_FIELD_ORDER = [
  "firm_name",
  "purchase_type",
  "gstin",
  "pan",
  "owner_name",
  "phone",
  "alternate_phone",
  "email",
  "street",
  "city",
  "state",
  "pincode",
  "bank_account_number",
  "ifsc_code",
  "account_category_id",
] as const;
const PRODUCT_CREATE_FIELD_ORDER = [
  "sku",
  "name",
  "brand_id",
  "category_id",
  "sub_category_id",
  "hsn_id",
  "description",
  "primary_unit_id",
  "secondary_unit_id",
  "secondary_unit_quantity",
  "third_unit_id",
  "third_unit_quantity",
  "weight_in_grams",
  "tax_percent",
] as const;

function getLineQuantityFields(line: LineDraft | null): LineField[] {
  if (!line?.product) {
    return ["quantity1"];
  }
  const fields: LineField[] = [];
  if (line.product.unit_3rd_name) fields.push("quantity3");
  if (line.product.unit_2nd_name) fields.push("quantity2");
  fields.push("quantity1");
  return fields;
}

function getLineFieldOrder(line: LineDraft | null): LineField[] {
  return ["product", ...getLineQuantityFields(line), "mrp", "rateValue", "rateUnitLevel", "discountPercent", "discountLumpsum"];
}

function resolveFieldForLine(line: LineDraft | null, preferred: LineField): LineField {
  const order = getLineFieldOrder(line);
  if (order.includes(preferred)) return preferred;
  if (preferred === "quantity3" || preferred === "quantity2" || preferred === "quantity1") {
    return getLineQuantityFields(line)[0] ?? "quantity1";
  }
  const preferredIndex = LINE_FIELD_ORDER.indexOf(preferred);
  for (let index = preferredIndex; index >= 0; index -= 1) {
    const candidate = LINE_FIELD_ORDER[index];
    if (order.includes(candidate)) return candidate;
  }
  return order[0] ?? "product";
}

function deriveTaxType(warehouseState?: string | null, vendorState?: string | null) {
  return (warehouseState || "").trim().toUpperCase() === (vendorState || "").trim().toUpperCase() ? "LOCAL" : "CENTRAL";
}

function derivePurchaseTypeFromGstin(gstin: string) {
  const normalized = gstin.trim().toUpperCase();
  if (normalized.length < 2) {
    return "CENTRAL" as const;
  }
  return normalized.startsWith("37") ? "LOCAL" as const : "CENTRAL" as const;
}

function lineBaseQuantity(line: LineDraft) {
  if (!line.product) return 0;
  const q1 = asDecimal(line.quantity1);
  const q2 = asDecimal(line.quantity2);
  const q3 = asDecimal(line.quantity3);
  const conv2 = asDecimal(line.product.conv_2_to_1);
  const conv3 = asDecimal(line.product.conv_3_to_1);
  return q1 + q2 * conv2 + q3 * conv3;
}

function lineUnitPrice(line: LineDraft) {
  if (!line.product) return 0;
  const rate = asDecimal(line.rateValue || line.product.latest_rate_value || line.product.cost_price);
  const conv2 = asDecimal(line.product.conv_2_to_1);
  const conv3 = asDecimal(line.product.conv_3_to_1);
  if (line.rateUnitLevel === 2 && conv2 > 0) return rate / conv2;
  if (line.rateUnitLevel === 3 && conv3 > 0) return rate / conv3;
  return rate;
}

function computeLineAmount(line: LineDraft) {
  if (!line.product) return 0;
  const baseQty = lineBaseQuantity(line);
  const subtotal = baseQty * lineUnitPrice(line);
  const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
  const discountAmount = subtotal * (discountPercent / 100);
  const taxable = subtotal - discountAmount;
  const tax = taxable * (asDecimal(line.product.tax_percent) / 100);
  return Math.max(0, taxable + tax);
}

function computeLineTaxableAmount(line: LineDraft) {
  if (!line.product) return 0;
  const baseQty = lineBaseQuantity(line);
  const subtotal = baseQty * lineUnitPrice(line);
  const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
  const discountAmount = subtotal * (discountPercent / 100);
  return Math.max(0, subtotal - discountAmount);
}

function computeLineDiscountAmount(line: LineDraft) {
  if (!line.product) return 0;
  const baseQty = lineBaseQuantity(line);
  const subtotal = baseQty * lineUnitPrice(line);
  const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
  return subtotal * (discountPercent / 100);
}

function roundCurrency(value: number) {
  return Math.round(value);
}

function mapVendorSummary(row: Record<string, unknown>): VendorSummary {
  return {
    vendor_id: String(row.vendor_id ?? ""),
    vendor_name: String(row.vendor_name ?? ""),
    address_lines: Array.isArray(row.address_lines) ? row.address_lines.map((item) => String(item)) : [],
    brand_names: asArray(row.brand_names).map((item) => String(item)),
    purchase_type: row.purchase_type === "LOCAL" ? "LOCAL" : row.purchase_type === "CENTRAL" ? "CENTRAL" : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    pincode: row.pincode ? String(row.pincode) : null,
    gstin: row.gstin ? String(row.gstin) : null,
    owner_name: row.owner_name ? String(row.owner_name) : null,
    phone: row.phone ? String(row.phone) : null,
    area: row.area ? String(row.area) : null,
    route: row.route ? String(row.route) : null,
    annual_purchase_amount: String(row.annual_purchase_amount ?? "0"),
    monthly_purchase_amount: String(row.monthly_purchase_amount ?? "0"),
    balance: String(row.balance ?? "0"),
    balance_side: String(row.balance_side ?? "CR"),
    last_purchase_date: row.last_purchase_date ? String(row.last_purchase_date) : null,
  last_payment_date: row.last_payment_date ? String(row.last_payment_date) : null,
  last_bills: asArray(row.last_bills).map((bill) => ({
      bill_number: String(bill.bill_number ?? ""),
      bill_date: String(bill.bill_date ?? ""),
      total_amount: String(bill.total_amount ?? "0"),
    })),
    open_challans: asArray(row.open_challans).map((challan) => ({
      challan_id: String(challan.challan_id ?? ""),
      reference_no: String(challan.reference_no ?? ""),
      challan_date: challan.challan_date ? String(challan.challan_date) : null,
      item_count: Number(challan.item_count ?? 0),
    })),
  };
}

function mapProductSummary(row: Record<string, unknown>): ProductSummary {
  return {
    product_id: String(row.product_id ?? ""),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    brand: row.brand ? String(row.brand) : null,
    description: row.description ? String(row.description) : null,
    hsn_code: row.hsn_code ? String(row.hsn_code) : null,
    tax_percent: String(row.tax_percent ?? "0"),
    mrp: String(row.mrp ?? "0"),
    cost_price: String(row.cost_price ?? "0"),
    unit_1st_name: row.unit_1st_name ? String(row.unit_1st_name) : null,
    unit_2nd_name: row.unit_2nd_name ? String(row.unit_2nd_name) : null,
    unit_3rd_name: row.unit_3rd_name ? String(row.unit_3rd_name) : null,
    unit_1st_id: row.unit_1st_id ? String(row.unit_1st_id) : null,
    unit_2nd_id: row.unit_2nd_id ? String(row.unit_2nd_id) : null,
    unit_3rd_id: row.unit_3rd_id ? String(row.unit_3rd_id) : null,
    conv_2_to_1: row.conv_2_to_1 ? String(row.conv_2_to_1) : null,
    conv_3_to_2: row.conv_3_to_2 ? String(row.conv_3_to_2) : null,
    conv_3_to_1: row.conv_3_to_1 ? String(row.conv_3_to_1) : null,
    stock_base_quantity: String(row.stock_base_quantity ?? "0"),
    stock_ratio: String(row.stock_ratio ?? "0 : 0 : 0"),
    latest_rate_value: row.latest_rate_value ? String(row.latest_rate_value) : null,
    latest_rate_unit_level: row.latest_rate_unit_level ? Number(row.latest_rate_unit_level) : null,
    latest_discount_percent: row.latest_discount_percent ? String(row.latest_discount_percent) : null,
    recent_bills: asArray(row.recent_bills).map((bill) => ({
      bill_number: String(bill.bill_number ?? ""),
      bill_date: String(bill.bill_date ?? ""),
      line_total_amount: String(bill.line_total_amount ?? "0"),
    })),
  };
}

type PurchaseEntryWorkspaceProps = {
  onSaved?: () => void;
  onClose?: () => void;
  initialId?: string;
  sourceChallanId?: string;
  mode?: "bill" | "challan";
};

export function PurchaseEntryWorkspace({ onSaved, onClose, initialId, sourceChallanId, mode = "bill" }: PurchaseEntryWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouseState, setWarehouseState] = useState<string | null>(null);
  const [billDateInput, setBillDateInput] = useState(formatDisplayDate(todayIso()));
  const [billDate, setBillDate] = useState(todayIso());
  const [billNumber, setBillNumber] = useState("");
  const [receivedDateInput, setReceivedDateInput] = useState(formatDisplayDate(todayIso()));
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<"CREDIT" | "CASH">("CREDIT");
  const [paymentModeOpen, setPaymentModeOpen] = useState(false);
  const [paymentModeIndex, setPaymentModeIndex] = useState(0);
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);
  const [warehouseIndex, setWarehouseIndex] = useState(0);
  const [taxType, setTaxType] = useState<"LOCAL" | "CENTRAL">("CENTRAL");
  const [freightAmount, setFreightAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [entryNumber, setEntryNumber] = useState("");
  const [vendorSummary, setVendorSummary] = useState<VendorSummary | null>(null);
  const [vendorSearchOpen, setVendorSearchOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorResults, setVendorResults] = useState<VendorSummary[]>([]);
  const [vendorIndex, setVendorIndex] = useState(0);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSummary[]>([]);
  const [productIndex, setProductIndex] = useState(0);
  const [activeRow, setActiveRow] = useState(0);
  const [activeField, setActiveField] = useState<LineField>("product");
  const [lines, setLines] = useState<LineDraft[]>([makeLine()]);
  const [rateUnitPicker, setRateUnitPicker] = useState<{ rowIndex: number; optionIndex: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [productEditForm, setProductEditForm] = useState<ProductEditForm>(EMPTY_PRODUCT_EDIT);
  const [hsnOptions, setHsnOptions] = useState<HsnOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [brandOptions, setBrandOptions] = useState<LookupOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<LookupOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<SubCategoryOption[]>([]);
  const [vendorCategoryOptions, setVendorCategoryOptions] = useState<AccountCategoryOption[]>([]);
  const [vendorCreateOpen, setVendorCreateOpen] = useState(false);
  const [productCreateOpen, setProductCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<"" | "brand" | "category" | "subCategory" | "unit" | "hsn">("");
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCode, setQuickCode] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickGst, setQuickGst] = useState("0");
  const [quickCategoryId, setQuickCategoryId] = useState("");
  const [vendorCategoryCreateOpen, setVendorCategoryCreateOpen] = useState(false);
  const [creatingVendorCategory, setCreatingVendorCategory] = useState(false);
  const [vendorCategoryForm, setVendorCategoryForm] = useState({ code: "", name: "", description: "" });
  const [creatingVendor, setCreatingVendor] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [vendorCreateForm, setVendorCreateForm] = useState<VendorCreateForm>({ ...EMPTY_VENDOR_FORM });
  const [productCreateForm, setProductCreateForm] = useState<ProductCreateForm>({ ...EMPTY_PRODUCT_FORM });
  const [productTargetRow, setProductTargetRow] = useState(0);
  const billDateRef = useRef<HTMLInputElement | null>(null);
  const billDatePickerRef = useRef<HTMLInputElement | null>(null);
  const billNumberRef = useRef<HTMLInputElement | null>(null);
  const receivedDateRef = useRef<HTMLInputElement | null>(null);
  const receivedDatePickerRef = useRef<HTMLInputElement | null>(null);
  const paymentModeRef = useRef<HTMLButtonElement | null>(null);
  const warehouseButtonRef = useRef<HTMLButtonElement | null>(null);
  const freightRef = useRef<HTMLInputElement | null>(null);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const vendorSearchRef = useRef<HTMLInputElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const productCellRef = useRef<HTMLButtonElement | null>(null);
  const vendorButtonRef = useRef<HTMLButtonElement | null>(null);
  const vendorCreateRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const productCreateRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({});
  const vendorCreateSaveRef = useRef<HTMLButtonElement | null>(null);
  const productCreateSaveRef = useRef<HTMLButtonElement | null>(null);
  const lineRefs = useRef<Record<string, HTMLInputElement | HTMLButtonElement | null>>({});

  const activeLine = lines[activeRow] ?? null;

  const setLineRef = useCallback((rowId: string, field: LineField) => {
    return (node: HTMLInputElement | HTMLButtonElement | null) => {
      lineRefs.current[`${rowId}:${field}`] = node;
    };
  }, []);

  const setVendorCreateRef = useCallback((field: string) => {
    return (node: HTMLInputElement | HTMLSelectElement | null) => {
      vendorCreateRefs.current[field] = node;
    };
  }, []);

  const setProductCreateRef = useCallback((field: string) => {
    return (node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
      productCreateRefs.current[field] = node;
    };
  }, []);

  const focusVendorCreateField = useCallback((field: string) => {
    const node = vendorCreateRefs.current[field];
    if (node && "focus" in node) {
      node.focus();
      if ("select" in node && typeof node.select === "function") {
        node.select();
      }
    }
  }, []);

  const focusProductCreateField = useCallback((field: string) => {
    const node = productCreateRefs.current[field];
    if (node && "focus" in node) {
      node.focus();
      if ("select" in node && typeof node.select === "function") {
        node.select();
      }
    }
  }, []);

  const handleVendorCreateKeyDown = useCallback((event: ReactKeyboardEvent, field: (typeof VENDOR_CREATE_FIELD_ORDER)[number]) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const currentIndex = VENDOR_CREATE_FIELD_ORDER.indexOf(field);
    const nextField = VENDOR_CREATE_FIELD_ORDER[currentIndex + 1];
    if (nextField) {
      focusVendorCreateField(nextField);
      return;
    }
    vendorCreateSaveRef.current?.focus();
  }, [focusVendorCreateField]);

  const handleProductCreateKeyDown = useCallback((event: ReactKeyboardEvent, field: (typeof PRODUCT_CREATE_FIELD_ORDER)[number]) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const currentIndex = PRODUCT_CREATE_FIELD_ORDER.indexOf(field);
    const nextField = PRODUCT_CREATE_FIELD_ORDER[currentIndex + 1];
    if (nextField) {
      focusProductCreateField(nextField);
      return;
    }
    productCreateSaveRef.current?.focus();
  }, [focusProductCreateField]);

  const focusLineField = useCallback((rowIndex: number, field: LineField) => {
    const row = lines[rowIndex];
    if (!row) {
      return;
    }
    setActiveField(field);
    const key = `${row.id}:${field}`;
    const node = lineRefs.current[key];
    if (node && "focus" in node) {
      node.focus();
      if ("select" in node && typeof node.select === "function") {
        node.select();
      }
    }
  }, [lines]);

  const totals = useMemo(() => {
    const valueOfGoods = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
      const discountAmount = subtotal * (discountPercent / 100);
      return sum + Math.max(0, subtotal - discountAmount);
    }, 0);
    const gst = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
      const discountAmount = subtotal * (discountPercent / 100);
      const taxable = Math.max(0, subtotal - discountAmount);
      return sum + taxable * (asDecimal(line.product.tax_percent) / 100);
    }, 0);
    const discount = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
      return sum + subtotal * (discountPercent / 100);
    }, 0);
    const freight = asDecimal(freightAmount);
    const grossFinalAmount = valueOfGoods + gst + freight;
    const finalAmount = roundCurrency(grossFinalAmount);
    const roundOff = finalAmount - grossFinalAmount;
    return { valueOfGoods, discount, gst, freight, grossFinalAmount, roundOff, finalAmount };
  }, [freightAmount, lines]);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const [bootstrapRes, warehouseRes, hsnRes, unitRes] = await Promise.all([
        fetchBackend("/procurement/purchase-entry/bootstrap"),
        fetchBackend("/masters/warehouses?page=1&page_size=200"),
        fetchBackend("/masters/hsn?page=1&page_size=200"),
        fetchBackend("/masters/units?page=1&page_size=200"),
      ]);
      const bootstrap = asObject(bootstrapRes);
      const warehouseItems = asArray(asObject(warehouseRes).items).map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        code: String(item.code ?? ""),
        state: item.state ? String(item.state) : null,
      }));
      setWarehouses(warehouseItems);
      setWarehouseId(String(bootstrap.default_warehouse_id ?? warehouseItems[0]?.id ?? ""));
      setEntryNumber(String(bootstrap.next_entry_number ?? ""));
      setBillNumber(String(bootstrap.next_entry_number ?? ""));
      setHsnOptions(asArray(asObject(hsnRes).items).map((item) => ({ id: String(item.id ?? ""), hsn_code: String(item.hsn_code ?? ""), gst_percent: String(item.gst_percent ?? "0") })));
      setUnitOptions(asArray(asObject(unitRes).items).map((item) => ({ id: String(item.id ?? ""), unit_code: String(item.unit_code ?? ""), unit_name: String(item.unit_name ?? "") })));
      const activeWarehouse = warehouseItems.find((item) => item.id === String(bootstrap.default_warehouse_id ?? "")) ?? warehouseItems[0];
      setWarehouseState(activeWarehouse?.state ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load purchase entry");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCreateReferences = useCallback(async () => {
    try {
      const [brandRes, categoryRes, subCategoryRes, vendorCategoryRes] = await Promise.all([
        fetchBackendFresh("/masters/product-brands?page=1&page_size=200"),
        fetchBackendFresh("/masters/product-categories?page=1&page_size=200"),
        fetchBackendFresh("/masters/product-sub-categories?page=1&page_size=200"),
        fetchBackendFresh("/masters/account-categories?party_type=VENDOR&page=1&page_size=200"),
      ]);
      setBrandOptions(asArray(asObject(brandRes).items).map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? "") })));
      setCategoryOptions(asArray(asObject(categoryRes).items).map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? "") })));
      setSubCategoryOptions(asArray(asObject(subCategoryRes).items).map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? ""), category_id: item.category_id ? String(item.category_id) : undefined })));
      setVendorCategoryOptions(asArray(asObject(vendorCategoryRes).items).map((item) => ({ id: String(item.id ?? ""), code: String(item.code ?? ""), name: String(item.name ?? "") })));
    } catch {
      setBrandOptions([]);
      setCategoryOptions([]);
      setSubCategoryOptions([]);
      setVendorCategoryOptions([]);
    }
  }, []);

  const searchVendors = useCallback(async (query: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const res = await fetchBackendFresh(`/procurement/purchase-entry/vendors/search?${params.toString()}`);
    const items = asArray(asObject(res).items).map(mapVendorSummary);
    setVendorResults(items);
    setVendorIndex(0);
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const res = await fetchBackendFresh(`/procurement/purchase-entry/products/search?${params.toString()}`);
    const items = asArray(asObject(res).items).map(mapProductSummary);
    setProductResults(items);
    setProductIndex(0);
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!initialId && !sourceChallanId) return;
    void (async () => {
      try {
        const isConversion = Boolean(sourceChallanId);
        const effectiveId = sourceChallanId || initialId;
        const fetchEndpoint = isConversion ? "/procurement/purchase-challans" : (mode === "challan" ? "/procurement/purchase-challans" : "/procurement/purchase-bills");
        
        const data = asObject(await fetchBackend(`${fetchEndpoint}/${effectiveId}`));
        
        if (!isConversion) {
          setEntryNumber(String(data.entry_number || ""));
          setBillNumber(String(data.bill_number || data.reference_no || ""));
        }
        
        setBillDate(String(data.bill_date || data.challan_date || todayIso()));
        setBillDateInput(formatDisplayDate(String(data.bill_date || data.challan_date || todayIso())));
        setReceivedDate(String(data.received_date || todayIso()));
        setReceivedDateInput(formatDisplayDate(String(data.received_date || todayIso())));
        setPaymentMode(data.payment_mode === "CASH" ? "CASH" : "CREDIT");
        setWarehouseId(String(data.warehouse_id || ""));
        setFreightAmount(String(data.freight_amount || "0"));
        setNotes(String(data.notes || ""));

        if (data.vendor_id) {
          const v = asObject(await fetchBackend(`/procurement/purchase-entry/vendors/${data.vendor_id}/summary`));
          setVendorSummary(mapVendorSummary(v));
        }

        const items = asArray(data.items);
        if (items.length > 0) {
          const mappedLines = await Promise.all(items.map(async (item) => {
            const p = mapProductSummary(asObject(await fetchBackend(`/procurement/purchase-entry/products/${item.product_id}/summary`)));
            const line: LineDraft = {
              id: crypto.randomUUID(),
              product: p,
              quantity1: String(item.quantity_1st || ""),
              quantity2: String(item.quantity_2nd || ""),
              quantity3: String(item.quantity_3rd || ""),
              mrp: String(item.mrp || "0"),
              rateValue: String(item.rate_value || "0"),
              rateUnitLevel: (Number(item.rate_unit_level) || 1) as 1 | 2 | 3,
              discountPercent: String(item.discount_percent || "0"),
              discountLumpsum: String(item.discount_lumpsum || "0"),
              amount: String(item.line_total_amount || "0"),
            };
            return line;
          }));
          setLines([...mappedLines, makeLine()]);
        }
      } catch (error) {
        toast.error("Failed to load initial data");
      }
    })();
  }, [initialId, sourceChallanId, mode]);

  useEffect(() => {
    if (!loading) {
      billDateRef.current?.focus();
      billDateRef.current?.select();
    }
  }, [loading]);

  useEffect(() => {
    void loadCreateReferences();
  }, [loadCreateReferences]);

  useEffect(() => {
    if (!vendorSearchOpen) return;
    void searchVendors(vendorSearch);
  }, [vendorSearchOpen, vendorSearch, searchVendors]);

  useEffect(() => {
    if (!productSearchOpen) return;
    void searchProducts(productSearch);
  }, [productSearchOpen, productSearch, searchProducts]);

  useEffect(() => {
    const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
    const nextWarehouseState = selectedWarehouse?.state ?? null;
    setWarehouseState(nextWarehouseState);
    if (vendorSummary) {
      setTaxType((vendorSummary.purchase_type || deriveTaxType(nextWarehouseState, vendorSummary.state)) as "LOCAL" | "CENTRAL");
    }
  }, [vendorSummary, warehouseId, warehouses]);

  useEffect(() => {
    if (vendorSearchOpen) {
      setTimeout(() => vendorSearchRef.current?.focus(), 0);
    }
  }, [vendorSearchOpen]);

  useEffect(() => {
    if (productSearchOpen) {
      setTimeout(() => productSearchRef.current?.focus(), 0);
    }
  }, [productSearchOpen]);

  useEffect(() => {
    if (paymentModeOpen) {
      setPaymentModeIndex(PAYMENT_MODE_OPTIONS.indexOf(paymentMode));
    }
  }, [paymentMode, paymentModeOpen]);

  useEffect(() => {
    if (warehousePickerOpen) {
      const index = Math.max(0, warehouses.findIndex((warehouse) => warehouse.id === warehouseId));
      setWarehouseIndex(index < 0 ? 0 : index);
    }
  }, [warehouseId, warehousePickerOpen, warehouses]);

  useEffect(() => {
    if (vendorCreateOpen) {
      setTimeout(() => focusVendorCreateField("firm_name"), 0);
    }
  }, [focusVendorCreateField, vendorCreateOpen]);

  useEffect(() => {
    if (productCreateOpen) {
      setTimeout(() => focusProductCreateField("sku"), 0);
    }
  }, [focusProductCreateField, productCreateOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (productSearchOpen) {
        event.preventDefault();
        setProductSearchOpen(false);
        setTimeout(() => focusLineField(activeRow, "product"), 0);
        return;
      }
      if (rateUnitPicker) {
        event.preventDefault();
        const rowIndex = rateUnitPicker.rowIndex;
        setRateUnitPicker(null);
        setTimeout(() => focusLineField(rowIndex, "rateUnitLevel"), 0);
        return;
      }
      if (paymentModeOpen) {
        event.preventDefault();
        setPaymentModeOpen(false);
        setTimeout(() => paymentModeRef.current?.focus(), 0);
        return;
      }
      if (warehousePickerOpen) {
        event.preventDefault();
        setWarehousePickerOpen(false);
        setTimeout(() => warehouseButtonRef.current?.focus(), 0);
        return;
      }
      if (vendorSearchOpen) {
        event.preventDefault();
        setVendorSearchOpen(false);
        setTimeout(() => vendorButtonRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeRow, focusLineField, paymentModeOpen, productSearchOpen, rateUnitPicker, vendorSearchOpen, warehousePickerOpen]);

  async function confirmDate(input: string, setValue: (iso: string) => void, setDisplay: (display: string) => void, next: () => void) {
    const parsed = parseDateInput(input);
    if (!parsed) {
      toast.error("Enter date as ddmmyyyy or dd-mm-yyyy");
      return;
    }
    if (parsed !== todayIso()) {
      const proceed = window.confirm(`Date ${formatDisplayDate(parsed)} is not today. Proceed?`);
      if (!proceed) {
        return;
      }
    }
    setValue(parsed);
    setDisplay(formatDisplayDate(parsed));
    next();
  }

  const selectVendor = useCallback((vendor: VendorSummary) => {
    setVendorSummary(vendor);
    setTaxType((vendor.purchase_type || deriveTaxType(warehouseState, vendor.state)) as "LOCAL" | "CENTRAL");
    setVendorSearchOpen(false);
    setVendorSearch("");
    setTimeout(() => billNumberRef.current?.focus(), 0);
  }, [warehouseState]);

  const updateLine = useCallback((index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, idx) => {
      if (idx !== index) return line;
      let next = { ...line, ...patch };
      
      // Bi-directional discount calculation (per-unit basis)
      if (next.product) {
        const rate = asDecimal(next.rateValue || next.product.latest_rate_value || next.product.cost_price);
        
        if ("discountPercent" in patch && !("discountLumpsum" in patch)) {
          const pct = asDecimal(patch.discountPercent);
          next.discountLumpsum = rate > 0 ? (rate * (pct / 100)).toFixed(2) : "0.00";
        } else if ("discountLumpsum" in patch && !("discountPercent" in patch)) {
          const amt = asDecimal(patch.discountLumpsum);
          next.discountPercent = rate > 0 ? ((amt / rate) * 100).toFixed(2) : "0.00";
        } else if (("rateValue" in patch || "rateUnitLevel" in patch)) {
          // If rate changes, keep percent and update per-unit discount amount
          const pct = asDecimal(next.discountPercent);
          next.discountLumpsum = rate > 0 ? (rate * (pct / 100)).toFixed(2) : "0.00";
        }
      }

      return { ...next, amount: computeLineAmount(next).toFixed(2) };
    }));
  }, []);

  const ensureTrailingEmptyLine = useCallback(() => {
    setLines((prev) => {
      const blankIndexes = prev.map((line, index) => ({ line, index })).filter(({ line }) => line.product === null);
      if (!blankIndexes.length) {
        return [...prev, makeLine()];
      }
      if (blankIndexes.length === 1 && blankIndexes[0].index === prev.length - 1) {
        return prev;
      }
      const firstBlank = blankIndexes[0].index;
      const next = prev.filter((_, index) => index <= firstBlank || prev[index].product !== null);
      return next;
    });
  }, []);

  const selectProduct = useCallback((product: ProductSummary, targetRow = productTargetRow) => {
    updateLine(targetRow, {
      product,
      mrp: product.mrp ? Number(product.mrp).toFixed(2) : "0.00",
      rateValue: product.latest_rate_value || product.cost_price || "0",
      rateUnitLevel: (product.latest_rate_unit_level as 1 | 2 | 3 | null) ?? 1,
      discountPercent: product.latest_discount_percent || "0",
    });
    setProductSearchOpen(false);
    setProductSearch("");
    ensureTrailingEmptyLine();
    setActiveRow(targetRow);
    const firstField = getLineQuantityFields({ ...makeLine(), product })[0] ?? "quantity1";
    setActiveField(firstField);
    setTimeout(() => {
      focusLineField(targetRow, firstField);
    }, 80);
  }, [ensureTrailingEmptyLine, focusLineField, productTargetRow, updateLine]);

  const openProductSelector = useCallback((rowIndex = activeRow) => {
    if (!vendorSummary?.vendor_id) {
      toast.error("Select vendor first");
      return;
    }
    setProductTargetRow(rowIndex);
    setProductSearchOpen(true);
  }, [activeRow, vendorSummary?.vendor_id]);

  const openPaymentModePicker = useCallback(() => {
    setPaymentModeIndex(PAYMENT_MODE_OPTIONS.indexOf(paymentMode));
    setPaymentModeOpen(true);
  }, [paymentMode]);

  const openWarehousePicker = useCallback(() => {
    const currentIndex = Math.max(0, warehouses.findIndex((warehouse) => warehouse.id === warehouseId));
    setWarehouseIndex(currentIndex < 0 ? 0 : currentIndex);
    setWarehousePickerOpen(true);
  }, [warehouseId, warehouses]);

  const openProductEdit = useCallback(async (product: ProductSummary) => {
    const full = mapProductSummary(asObject(await fetchBackend(`/procurement/purchase-entry/products/${product.product_id}/summary`)));
    setProductEditForm({
      sku: full.sku,
      name: full.name,
      description: full.description || "",
      hsn_id: hsnOptions.find((item) => item.hsn_code === full.hsn_code)?.id || "",
      primary_unit_id: full.unit_1st_id || "",
      secondary_unit_id: full.unit_2nd_id || "",
      third_unit_id: full.unit_3rd_id || "",
      secondary_unit_quantity: full.conv_2_to_1 || "",
      third_unit_quantity: full.conv_3_to_2 || "",
      weight_in_grams: full.stock_base_quantity ? "" : "",
      tax_percent: full.tax_percent,
    });
    setProductEditOpen(true);
  }, [hsnOptions]);

  async function saveProductEdit() {
    if (!activeLine?.product) return;
    try {
      await patchBackend(`/masters/products/${activeLine.product.product_id}`, {
        sku: productEditForm.sku,
        name: productEditForm.name,
        description: productEditForm.description || null,
        hsn_id: productEditForm.hsn_id || null,
        primary_unit_id: productEditForm.primary_unit_id || null,
        secondary_unit_id: productEditForm.secondary_unit_id || null,
        third_unit_id: productEditForm.third_unit_id || null,
        secondary_unit_quantity: productEditForm.secondary_unit_id ? Number(productEditForm.secondary_unit_quantity || 0) : null,
        third_unit_quantity: productEditForm.third_unit_id ? Number(productEditForm.third_unit_quantity || 0) : null,
        weight_in_grams: productEditForm.weight_in_grams ? Number(productEditForm.weight_in_grams) : null,
        tax_percent: Number(productEditForm.tax_percent || 0),
      });
      const refreshed = mapProductSummary(asObject(await fetchBackend(`/procurement/purchase-entry/products/${activeLine.product.product_id}/summary`)));
      updateLine(activeRow, { product: refreshed, amount: computeLineAmount({ ...activeLine, product: refreshed }).toFixed(2) });
      setProductEditOpen(false);
      toast.success("Product updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update product");
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
        await postBackend("/masters/product-sub-categories", {
          name: quickName.trim(),
          category_id: quickCategoryId || null,
        });
      } else if (quickCreateType === "unit") {
        await postBackend("/masters/units", { unit_code: quickCode.trim(), unit_name: quickName.trim() });
      } else if (quickCreateType === "hsn") {
        await postBackend("/masters/hsn", {
          hsn_code: quickCode.trim(),
          description: quickDescription.trim() || null,
          gst_percent: Number(quickGst || "0"),
        });
      }
      await loadCreateReferences();
      setQuickCreateType("");
      setQuickName("");
      setQuickCode("");
      setQuickDescription("");
      setQuickGst("0");
      setQuickCategoryId("");
      toast.success("Master created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create master");
    } finally {
      setQuickCreating(false);
    }
  }

  async function createInlineVendorCategory() {
    if (!vendorCategoryForm.code.trim() || !vendorCategoryForm.name.trim()) {
      toast.error("Category code and name are required");
      return;
    }
    setCreatingVendorCategory(true);
    try {
      const created = asObject(await postBackend("/masters/account-categories", {
        code: vendorCategoryForm.code.trim(),
        name: vendorCategoryForm.name.trim(),
        party_type: "VENDOR",
        description: vendorCategoryForm.description.trim() || null,
        is_active: true,
      }));
      await loadCreateReferences();
      setVendorCreateForm((prev) => ({ ...prev, account_category_id: String(created.id ?? "") }));
      setVendorCategoryForm({ code: "", name: "", description: "" });
      setVendorCategoryCreateOpen(false);
      toast.success("Account category created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account category");
    } finally {
      setCreatingVendorCategory(false);
    }
  }

  const showLedger = useCallback(async () => {
    if (!vendorSummary) return;
    try {
      const res = asObject(await fetchBackend(`/finance/party-ledger/vendor/${vendorSummary.vendor_id}`));
      setLedgerRows(asArray(res.items).map((item) => ({
        entry_id: String(item.entry_id ?? ""),
        entry_date: String(item.entry_date ?? ""),
        description: String(item.description ?? ""),
        admin_debit: String(item.admin_debit ?? "0"),
        admin_credit: String(item.admin_credit ?? "0"),
        running_balance: String(item.running_balance ?? "0"),
        balance_side: String(item.balance_side ?? "CR"),
      })));
      setLedgerOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load ledger");
    }
  }, [vendorSummary]);

  const saveEntry = useCallback(async () => {
    if (!vendorSummary) {
      toast.error("Select vendor");
      return;
    }
    const validLines = lines.filter((line) => line.product && lineBaseQuantity(line) > 0);
    if (!validLines.length) {
      toast.error("Add at least one product line");
      return;
    }
    const proceed = window.confirm(`Save purchase ${mode} ${billNumber} for ${vendorSummary.vendor_name}?`);
    if (!proceed) return;
    setSaving(true);
    try {
      const payload = {
        vendor_id: vendorSummary.vendor_id,
        warehouse_id: warehouseId,
        bill_number: billNumber,
        bill_date: billDate,
        received_date: receivedDate,
        payment_mode: paymentMode,
        tax_type: taxType,
        freight_amount: Number(freightAmount || 0),
        entry_number: entryNumber,
        notes: notes || null,
        items: validLines.map((line, index) => ({
          product_id: line.product?.product_id,
          batch_no: `PBL-${billDate.replaceAll("-", "")}-${String(index + 1).padStart(3, "0")}`,
          expiry_date: null,
          quantity: lineBaseQuantity(line),
          quantity_1st: Number(line.quantity1 || 0),
          quantity_2nd: Number(line.quantity2 || 0),
          quantity_3rd: Number(line.quantity3 || 0),
          unit_1st_id: line.product?.unit_1st_id,
          unit_2nd_id: line.product?.unit_2nd_id,
          unit_3rd_id: line.product?.unit_3rd_id,
          base_quantity: lineBaseQuantity(line),
          mrp: Number(line.mrp || 0),
          damaged_quantity: 0,
          unit_price: lineUnitPrice(line),
          rate_value: Number(line.rateValue || 0),
          rate_unit_level: line.rateUnitLevel,
          discount_percent: Number(line.discountPercent || 0),
          discount_lumpsum: Number(line.discountLumpsum || 0),
          line_total_amount: Number(computeLineAmount(line).toFixed(2)),
        })),
      };

      const endpoint = mode === "challan" ? "/procurement/purchase-challans" : "/procurement/purchase-bills";

      if (initialId) {
        await patchBackend(`${endpoint}/${initialId}`, payload);
        toast.success(`Purchase ${mode} updated`);
      } else {
        await postBackend(mode === "challan" ? "/procurement/purchase-challans" : "/procurement/purchase-entry", payload);
        toast.success(`Purchase ${mode} saved`);
      }

      if (onSaved) {
        onSaved();
        return;
      }
      await showLedger();
      setLines([makeLine()]);
      setNotes("");
      setFreightAmount("0");
      setActiveRow(0);
      setEntryNumber(`${entryNumber}-N`);
      setBillNumber(`${billNumber}-N`);
      setTimeout(() => productCellRef.current?.focus(), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to save ${mode}`);
    } finally {
      setSaving(false);
    }
  }, [vendorSummary, lines, billNumber, mode, warehouseId, billDate, receivedDate, paymentMode, taxType, freightAmount, entryNumber, notes, initialId, onSaved, showLedger]);

  const moveGridFocus = useCallback((rowIndex: number, field: LineField) => {
    setActiveRow(rowIndex);
    const resolvedField = resolveFieldForLine(lines[rowIndex] ?? null, field);
    setActiveField(resolvedField);
    setTimeout(() => focusLineField(rowIndex, resolvedField), 0);
  }, [focusLineField, lines]);

  const navigateGridByDelta = useCallback((rowIndex: number, field: LineField, rowDelta: number, colDelta: number) => {
    const currentOrder = getLineFieldOrder(lines[rowIndex] ?? null);
    const currentCol = Math.max(0, currentOrder.indexOf(resolveFieldForLine(lines[rowIndex] ?? null, field)));
    const nextRow = Math.max(0, Math.min(lines.length - 1, rowIndex + rowDelta));
    if (colDelta !== 0) {
      const nextCol = Math.max(0, Math.min(currentOrder.length - 1, currentCol + colDelta));
      moveGridFocus(rowIndex, currentOrder[nextCol]);
      return;
    }
    moveGridFocus(nextRow, field);
  }, [lines, moveGridFocus]);

  const focusFooterField = useCallback((field: "freight" | "notes" | "save") => {
    setTimeout(() => {
      if (field === "freight") {
        freightRef.current?.focus();
        freightRef.current?.select();
        return;
      }
      if (field === "notes") {
        notesRef.current?.focus();
        return;
      }
      saveButtonRef.current?.focus();
    }, 0);
  }, []);

  const handleLineFieldEnter = useCallback((event: ReactKeyboardEvent, rowIndex: number, field: LineField) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (field === "product") {
      setActiveRow(rowIndex);
      setActiveField("product");
      openProductSelector(rowIndex);
      return;
    }
    if (field === "quantity3") {
      moveGridFocus(rowIndex, "quantity2");
      return;
    }
    if (field === "quantity2") {
      moveGridFocus(rowIndex, "quantity1");
      return;
    }
    if (field === "quantity1") {
      moveGridFocus(rowIndex, "mrp");
      return;
    }
    if (field === "mrp") {
      moveGridFocus(rowIndex, "rateValue");
      return;
    }
    if (field === "rateValue") {
      setActiveRow(rowIndex);
      setActiveField("rateUnitLevel");
      setRateUnitPicker({ rowIndex, optionIndex: Math.max(0, (lines[rowIndex]?.rateUnitLevel ?? 1) - 1) });
      return;
    }
    if (field === "rateUnitLevel") {
      moveGridFocus(rowIndex, "discountPercent");
      return;
    }
    if (field === "discountPercent") {
      moveGridFocus(rowIndex, "discountLumpsum");
      return;
    }
    if (field === "discountLumpsum") {
      const isLastFilledRow = rowIndex === lines.findLastIndex((line) => line.product !== null);
      if (isLastFilledRow) {
        focusFooterField("freight");
        return;
      }
      const nextRow = rowIndex + 1;
      setActiveRow(nextRow);
      setActiveField("product");
      setTimeout(() => focusLineField(nextRow, "product"), 0);
    }
  }, [focusFooterField, focusLineField, lines, moveGridFocus, openProductSelector]);

  const applyBillDateFromPicker = useCallback((iso: string) => {
    if (!iso) return;
    setBillDate(iso);
    setBillDateInput(formatDisplayDate(iso));
    setTimeout(() => setVendorSearchOpen(true), 0);
  }, []);

  const applyReceivedDateFromPicker = useCallback((iso: string) => {
    if (!iso) return;
    setReceivedDate(iso);
    setReceivedDateInput(formatDisplayDate(iso));
    setTimeout(() => paymentModeRef.current?.focus(), 0);
  }, []);

  const handleLineFieldKeyDown = useCallback((event: ReactKeyboardEvent, rowIndex: number, field: LineField) => {
    if (event.key === "Enter") {
      handleLineFieldEnter(event, rowIndex, field);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, 0, 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, 0, -1);
      return;
    }
    if (event.key === "ArrowDown") {
      if (field === "rateUnitLevel") {
        event.preventDefault();
        setRateUnitPicker({ rowIndex, optionIndex: Math.max(0, (lines[rowIndex]?.rateUnitLevel ?? 1) - 1) });
        return;
      }
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, 1, 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, -1, 0);
    }
  }, [handleLineFieldEnter, lines, navigateGridByDelta]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F4" && activeLine?.product) {
        event.preventDefault();
        void openProductEdit(activeLine.product);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveEntry();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeLine, openProductEdit, saveEntry]);

  if (loading) {
    return <div className="rounded-xl border bg-card px-4 py-10 text-sm text-muted-foreground">Loading purchase entry...</div>;
  }

  return (
    <div className="bg-[#eef3ec] font-mono text-[#111714]">
      <div className="relative overflow-hidden border border-[#59786f] bg-[#fbfcf7] shadow-[0_0_0_1px_rgba(89,120,111,0.24)]">
        <div className="flex items-center justify-between border-b border-[#59786f] bg-[#6f9186] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.32em] text-white">
          <span>Purchase {mode === "challan" ? "Challan" : "Entry"} Console</span>
          {onClose && <Button variant="ghost" size="sm" className="h-6 text-white hover:text-white/80" onClick={onClose}>ESC to Back</Button>}
        </div>
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border-r border-[#cad5cb]">
            {vendorSummary ? (
              <div className="grid gap-px border-b bg-border md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
                <div className="bg-[#fbfcf7] px-4 py-3">
                  <div className="truncate text-lg font-semibold">{vendorSummary.vendor_name} <span className="text-primary">[{paymentMode}]</span></div>
                  <div className="mt-1 truncate text-xs text-[#5b655f]">{vendorSummary.address_lines.join(", ")}</div>
                  <div className="mt-2 text-xs text-[#5b655f]">
                    Allowed Brands: {vendorSummary.brand_names.length ? vendorSummary.brand_names.join(", ") : "None linked"}
                  </div>
                  <div className="mt-1 text-xs text-[#5b655f]">
                    Vendor Type: {vendorSummary.purchase_type || "Not set"}
                  </div>
                </div>
                <div className="bg-[#fbfcf7] px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#6a746e]">Balance</div>
                  <div className="mt-1 font-semibold">{Number(vendorSummary.balance).toFixed(2)} {vendorSummary.balance_side}</div>
                </div>
                <div className="bg-[#fbfcf7] px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#6a746e]">Last Purc</div>
                  <div className="mt-1 font-semibold">{vendorSummary.last_purchase_date ? formatDisplayDate(vendorSummary.last_purchase_date) : "-"}</div>
                </div>
                <div className="bg-[#fbfcf7] px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#6a746e]">Last Pay</div>
                  <div className="mt-1 font-semibold">{vendorSummary.last_payment_date ? formatDisplayDate(vendorSummary.last_payment_date) : "-"}</div>
                </div>
                <div className="bg-[#fbfcf7] px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.22em] text-[#6a746e]">Month</div>
                  <div className="mt-1 font-semibold">{Number(vendorSummary.monthly_purchase_amount).toFixed(2)}</div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-px bg-border md:grid-cols-12">
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Purchase Date</Label>
                <div className="mt-2 grid gap-1">
                  <Input
                    ref={billDateRef}
                    value={billDateInput}
                    onChange={(e) => setBillDateInput(e.target.value)}
                    onFocus={() => setActiveField("product")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void confirmDate(billDateInput, setBillDate, setBillDateInput, () => setVendorSearchOpen(true));
                      }
                    }}
                    placeholder="ddmmyyyy"
                    className="h-11 w-full rounded-sm border-0 bg-[#eef1ea] text-lg font-semibold tracking-[0.2em] shadow-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-full rounded-sm border border-transparent bg-[#eef1ea] px-3 text-sm font-semibold shadow-none"
                    onClick={() => {
                      const node = billDatePickerRef.current;
                      if (!node) return;
                      if (typeof node.showPicker === "function") {
                        node.showPicker();
                      } else {
                        node.click();
                      }
                    }}
                  >
                    📅 Pick Date
                  </Button>
                  <input
                    ref={billDatePickerRef}
                    type="date"
                    value={billDate}
                    onChange={(e) => applyBillDateFromPicker(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-4">
                <Label className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Party</Label>
                <Button
                  ref={vendorButtonRef}
                  type="button"
                  variant="ghost"
                  className="mt-2 h-11 w-full justify-start rounded-sm border border-transparent bg-[#eef1ea] px-3 text-left text-base font-semibold shadow-none"
                  onClick={() => setVendorSearchOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "ArrowDown") {
                      e.preventDefault();
                      setVendorSearchOpen(true);
                    }
                  }}
                >
                  {vendorSummary ? vendorSummary.vendor_name : "Select vendor"}
                </Button>
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Bill No</Label>
                <Input ref={billNumberRef} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} onKeyDown={(e) => e.key === "Enter" && receivedDateRef.current?.focus()} className="mt-2 h-11 rounded-sm border-0 bg-[#eef1ea] text-base font-semibold shadow-none" />
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Delivery Date</Label>
                <div className="mt-2 grid gap-1">
                  <Input
                    ref={receivedDateRef}
                    value={receivedDateInput}
                    onChange={(e) => setReceivedDateInput(e.target.value)}
                    onFocus={() => setActiveField("product")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void confirmDate(receivedDateInput, setReceivedDate, setReceivedDateInput, () => paymentModeRef.current?.focus());
                      }
                    }}
                    placeholder="ddmmyyyy"
                    className="h-11 w-full rounded-sm border-0 bg-[#eef1ea] text-base font-semibold tracking-[0.12em] shadow-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-full rounded-sm border border-transparent bg-[#eef1ea] px-3 text-sm font-semibold shadow-none"
                    onClick={() => {
                      const node = receivedDatePickerRef.current;
                      if (!node) return;
                      if (typeof node.showPicker === "function") {
                        node.showPicker();
                      } else {
                        node.click();
                      }
                    }}
                  >
                    📅 Pick Date
                  </Button>
                  <input
                    ref={receivedDatePickerRef}
                    type="date"
                    value={receivedDate}
                    onChange={(e) => applyReceivedDateFromPicker(e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Mode</Label>
                <Button
                  ref={paymentModeRef}
                  type="button"
                  variant="ghost"
                  className="mt-2 h-11 w-full justify-start rounded-sm border border-transparent bg-[#eef1ea] px-3 text-left text-base font-semibold shadow-none"
                  onClick={openPaymentModePicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "ArrowDown") {
                      e.preventDefault();
                      openPaymentModePicker();
                    }
                  }}
                >
                  {paymentMode}
                </Button>
              </div>
            </div>

            <div className="grid gap-px border-t bg-border md:grid-cols-12">
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Station</div>
                <div className="mt-2 text-sm font-semibold">{warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || "-"}</div>
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-3">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Entry No</div>
                <div className="mt-2 h-10 rounded-sm bg-[#eef1ea] px-3 py-2 text-sm font-semibold">{entryNumber}</div>
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-2">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Type</div>
                <div className="mt-2 rounded-sm bg-[#eef1ea] px-3 py-2 text-sm font-semibold">{taxType}</div>
              </div>
              <div className="bg-[#fbfcf7] p-2.5 md:col-span-4">
                <div className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Warehouse</div>
                <Button
                  ref={warehouseButtonRef}
                  type="button"
                  variant="ghost"
                  className="mt-2 h-10 w-full justify-start rounded-sm border border-transparent bg-[#eef1ea] px-3 text-left text-sm font-semibold shadow-none"
                  onClick={openWarehousePicker}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === "ArrowDown") {
                      e.preventDefault();
                      openWarehousePicker();
                    }
                  }}
                >
                  {warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || "-"}
                  {warehouses.find((warehouse) => warehouse.id === warehouseId)?.code ? ` (${warehouses.find((warehouse) => warehouse.id === warehouseId)?.code})` : ""}
                </Button>
              </div>
            </div>

            <div className="border-t overflow-x-auto">
              <Table className="min-w-[1200px] table-fixed">
                <TableHeader>
                  <TableRow className="bg-[#e7f0cb] hover:bg-[#e7f0cb]">
                    <TableHead className="w-[44px] text-center text-sm font-semibold text-foreground">#</TableHead>
                    <TableHead className="text-sm font-semibold text-foreground">PRODUCT</TableHead>
                    <TableHead className="w-[85px] text-center text-sm font-semibold text-foreground">{activeLine?.product?.unit_3rd_name || "3rd"}</TableHead>
                    <TableHead className="w-[85px] text-center text-sm font-semibold text-foreground">{activeLine?.product?.unit_2nd_name || "2nd"}</TableHead>
                    <TableHead className="w-[85px] text-center text-sm font-semibold text-foreground">{activeLine?.product?.unit_1st_name || "1st"}</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-semibold text-foreground">MRP</TableHead>
                    <TableHead className="w-[90px] text-center text-sm font-semibold text-foreground">P.RATE</TableHead>
                    <TableHead className="w-[80px] text-center text-sm font-semibold text-foreground">UNIT</TableHead>
                    <TableHead className="w-[70px] text-center text-sm font-semibold text-foreground">DISC%</TableHead>
                    <TableHead className="w-[85px] text-center text-sm font-semibold text-foreground">DISC AMT</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-semibold text-foreground">TAXABLE</TableHead>
                    <TableHead className="w-[110px] text-right text-sm font-semibold text-foreground">AMOUNT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.id} className={cn(index === activeRow ? "bg-[#dfede5]" : "bg-[#fbfcf7]", "transition-colors")}>
                      <TableCell className="py-1.5 text-center text-sm font-semibold text-muted-foreground">
                        <span className={cn("inline-flex min-w-7 items-center justify-center rounded-sm px-1.5 py-1", index === activeRow ? "bg-[#2f5d50] text-white" : "bg-[#eef1ea]")}>
                          {index + 1}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 overflow-hidden">
                        <Button
                          ref={(node) => {
                            setLineRef(line.id, "product")(node);
                            if (index === activeRow) {
                              productCellRef.current = node;
                            }
                          }}
                          type="button"
                          variant="ghost"
                          className={cn(
                            "h-9 w-full justify-start rounded-none px-0 text-left text-sm font-semibold shadow-none",
                            index === activeRow && activeField === "product" ? "bg-[#2f5d50] px-2 text-white hover:bg-[#2f5d50]" : ""
                          )}
                          onClick={() => {
                            setActiveRow(index);
                            setActiveField("product");
                            openProductSelector(index);
                          }}
                          onKeyDown={(e) => {
                            handleLineFieldKeyDown(e, index, "product");
                          }}
                        >
                          {line.product ? `${line.product.name}${line.product.brand ? ` • ${line.product.brand}` : ""}` : "Search product"}
                        </Button>
                      </TableCell>
                      <TableCell className="w-[85px] py-1.5"><Input ref={setLineRef(line.id, "quantity3")} inputMode="numeric" value={line.quantity3} disabled={!line.product?.unit_3rd_name} onFocus={() => { setActiveRow(index); setActiveField("quantity3"); }} onChange={(e) => updateLine(index, { quantity3: sanitizeDigits(e.target.value) })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity3")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none disabled:opacity-20", index === activeRow && activeField === "quantity3" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[85px] py-1.5"><Input ref={setLineRef(line.id, "quantity2")} inputMode="numeric" value={line.quantity2} disabled={!line.product?.unit_2nd_name} onFocus={() => { setActiveRow(index); setActiveField("quantity2"); }} onChange={(e) => updateLine(index, { quantity2: sanitizeDigits(e.target.value) })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity2")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none disabled:opacity-20", index === activeRow && activeField === "quantity2" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[85px] py-1.5"><Input ref={setLineRef(line.id, "quantity1")} inputMode="numeric" value={line.quantity1} onFocus={() => { setActiveRow(index); setActiveField("quantity1"); }} onChange={(e) => updateLine(index, { quantity1: sanitizeDigits(e.target.value) })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity1")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none", index === activeRow && activeField === "quantity1" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[90px] py-1.5"><Input ref={setLineRef(line.id, "mrp")} value={line.mrp} onFocus={() => { setActiveRow(index); setActiveField("mrp"); }} onChange={(e) => updateLine(index, { mrp: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "mrp")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none", index === activeRow && activeField === "mrp" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[90px] py-1.5"><Input ref={setLineRef(line.id, "rateValue")} value={line.rateValue} onFocus={() => { setActiveRow(index); setActiveField("rateValue"); }} onChange={(e) => updateLine(index, { rateValue: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "rateValue")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none", index === activeRow && activeField === "rateValue" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[80px] py-1.5">
                        <Button
                          ref={setLineRef(line.id, "rateUnitLevel")}
                          type="button"
                          variant="ghost"
                          className={cn("h-9 w-full justify-center rounded-none border-0 bg-transparent px-2 text-center text-sm font-semibold shadow-none", index === activeRow && activeField === "rateUnitLevel" ? "bg-[#2f5d50] text-white hover:bg-[#2f5d50]" : "")}
                          onFocus={() => { setActiveRow(index); setActiveField("rateUnitLevel"); }}
                          onClick={() => setRateUnitPicker({ rowIndex: index, optionIndex: Math.max(0, line.rateUnitLevel - 1) })}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "rateUnitLevel")}
                        >
                          {line.rateUnitLevel === 3 ? (line.product?.unit_3rd_name || "3rd") : line.rateUnitLevel === 2 ? (line.product?.unit_2nd_name || "2nd") : (line.product?.unit_1st_name || "1st")}
                        </Button>
                      </TableCell>
                      <TableCell className="w-[70px] py-1.5"><Input ref={setLineRef(line.id, "discountPercent")} value={line.discountPercent} onFocus={() => { setActiveRow(index); setActiveField("discountPercent"); }} onChange={(e) => updateLine(index, { discountPercent: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "discountPercent")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none", index === activeRow && activeField === "discountPercent" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[85px] py-1.5"><Input ref={setLineRef(line.id, "discountLumpsum")} value={line.discountLumpsum} onFocus={() => { setActiveRow(index); setActiveField("discountLumpsum"); }} onChange={(e) => updateLine(index, { discountLumpsum: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "discountLumpsum")} className={cn("h-9 w-full rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold shadow-none", index === activeRow && activeField === "discountLumpsum" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[110px] py-1.5 text-right text-base font-semibold">{computeLineTaxableAmount(line).toFixed(2)}</TableCell>
                      <TableCell className="w-[110px] py-1.5 text-right text-base font-semibold">{Number(line.amount || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-px border-t bg-border md:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-px bg-border md:grid-cols-2">
                <div className="bg-[#fbfcf7] p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Selected Item</div>
                  {activeLine?.product ? (
                    <div className="mt-2 space-y-2">
                      <div className="text-base font-semibold">{activeLine.product.name}</div>
                      <div className="text-sm text-[#5b655f]">{activeLine.product.brand || "-"}</div>
                    <div>Stock: <span className="font-semibold">{activeLine.product.stock_ratio}</span></div>
                    <div>MRP: <span className="font-semibold">{Number(activeLine.product.mrp).toFixed(2)}</span></div>
                    <div>SRATE: <span className="font-semibold">{Number(activeLine.product.latest_rate_value || 0).toFixed(2)}</span></div>
                    </div>
                  ) : (
                    <div className="mt-2 text-muted-foreground">Select product to view detail.</div>
                  )}
                </div>
                <div className="bg-[#fbfcf7] p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Recent Product Bills</div>
                  <div className="mt-2 space-y-2">
                    {activeLine?.product?.recent_bills.length ? activeLine.product.recent_bills.slice(0, 3).map((bill) => (
                        <div key={`${bill.bill_number}-${bill.bill_date}`} className="flex items-center justify-between border-b border-[#dde6dc] pb-1 text-xs">
                        <span>{bill.bill_number}</span>
                        <span>{formatDisplayDate(bill.bill_date)}</span>
                        <span>{Number(bill.line_total_amount).toFixed(2)}</span>
                      </div>
                    )) : <div className="text-muted-foreground">No recent bills.</div>}
                  </div>
                </div>
              </div>
              <div className="bg-[#fbfcf7] p-3 text-sm">
                <div className="grid grid-cols-2 gap-y-2">
                  <div>VALUE OF GOODS</div><div className="text-right font-semibold">{totals.valueOfGoods.toFixed(2)}</div>
                  <div>DISCOUNT</div><div className="text-right font-semibold">{totals.discount.toFixed(2)}</div>
                  <div>GST</div><div className="text-right font-semibold">{totals.gst.toFixed(2)}</div>
                  <div className="self-center">FREIGHT</div>
                  <div>
                    <Input
                      ref={freightRef}
                      className="h-9 rounded-none border-x-0 border-t-0 bg-transparent text-right font-semibold shadow-none"
                      value={freightAmount}
                      onChange={(e) => setFreightAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusFooterField("notes");
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const lastFilledRow = lines.findLastIndex((line) => line.product !== null);
                          if (lastFilledRow >= 0) {
                            focusLineField(lastFilledRow, "discountPercent");
                          }
                        }
                      }}
                    />
                  </div>
                  <div>ROUND OFF</div><div className="text-right font-semibold">{totals.roundOff.toFixed(2)}</div>
                  <div className="pt-2 text-base font-semibold">FINAL BILL</div><div className="pt-2 text-right text-2xl font-bold">{totals.finalAmount.toFixed(2)}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button ref={saveButtonRef} className="rounded-sm" onClick={() => void saveEntry()} disabled={saving}>{saving ? "Saving..." : `Save ${mode === "challan" ? "Challan" : "Bill"}`}</Button>
                  <Button variant="outline" onClick={() => void showLedger()} disabled={!vendorSummary}>Ledger</Button>
                  {activeLine?.product ? <Button variant="outline" onClick={() => void openProductEdit(activeLine.product!)}>Edit Product</Button> : null}
                  {onClose && <Button variant="secondary" onClick={onClose}>Back</Button>}
                </div>
                <div className="mt-4">
                  <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Narration</Label>
                  <Textarea
                    ref={notesRef}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="mt-2 rounded-none border-x-0 border-t-0 bg-transparent shadow-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        focusFooterField("save");
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        focusFooterField("freight");
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-px bg-border">
            <div className="bg-[#fbfcf7] p-4 text-sm">
              <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Party History</div>
              {vendorSummary ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-base font-semibold">{vendorSummary.vendor_name}</div>
                    <div className="mt-1 text-[#5b655f]">{vendorSummary.address_lines.join(", ")}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Annual</div><div className="text-right font-semibold">{Number(vendorSummary.annual_purchase_amount).toFixed(2)}</div>
                    <div>Month</div><div className="text-right font-semibold">{Number(vendorSummary.monthly_purchase_amount).toFixed(2)}</div>
                    <div>Balance</div><div className="text-right font-semibold">{Number(vendorSummary.balance).toFixed(2)} {vendorSummary.balance_side}</div>
                    <div>Last Purc</div><div className="text-right font-semibold">{vendorSummary.last_purchase_date ? formatDisplayDate(vendorSummary.last_purchase_date) : "-"}</div>
                    <div>Last Pay</div><div className="text-right font-semibold">{vendorSummary.last_payment_date ? formatDisplayDate(vendorSummary.last_payment_date) : "-"}</div>
                    <div>GSTIN</div><div className="text-right font-semibold">{vendorSummary.gstin || "-"}</div>
                    <div>Type</div><div className="text-right font-semibold">{vendorSummary.purchase_type || "-"}</div>
                    <div>Area / Route</div><div className="text-right font-semibold">{vendorSummary.area || "-"} / {vendorSummary.route || "-"}</div>
                  </div>
                  <div className="border-t pt-3">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Last 3 Bills</div>
                    <div className="space-y-2">
                      {vendorSummary.last_bills.map((bill) => (
                        <div key={`${bill.bill_number}-${bill.bill_date}`} className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs">
                          <span>{bill.bill_number}</span>
                          <span>{formatDisplayDate(bill.bill_date)}</span>
                          <span className="text-right font-semibold">{Number(bill.total_amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border-t pt-3">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Available Challans</div>
                    <div className="space-y-2">
                      {vendorSummary.open_challans.length ? vendorSummary.open_challans.map((challan) => (
                        <div key={challan.challan_id} className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs">
                          <span>{challan.reference_no}</span>
                          <span>{challan.challan_date ? formatDisplayDate(challan.challan_date) : "-"}</span>
                          <span className="text-right font-semibold">{challan.item_count} items</span>
                        </div>
                      )) : <div className="text-xs text-muted-foreground">No open challans.</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground">Select vendor to view history.</div>
              )}
            </div>
            <div className="bg-[#fbfcf7] p-4 text-sm">
              <div className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[#6a746e]">Product Context</div>
              {activeLine?.product ? (
                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <div className="font-semibold text-foreground">{activeLine.product.name}</div>
                    <div className="mt-1 text-muted-foreground">{activeLine.product.sku}{activeLine.product.brand ? ` • ${activeLine.product.brand}` : ""}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Units</div>
                    <div className="text-right font-semibold">
                      {[activeLine.product.unit_1st_name, activeLine.product.unit_2nd_name, activeLine.product.unit_3rd_name].filter(Boolean).join(" / ")}
                    </div>
                    <div>Stock Ratio</div>
                    <div className="text-right font-semibold">{activeLine.product.stock_ratio}</div>
                    <div>Last Rate</div>
                    <div className="text-right font-semibold">{Number(activeLine.product.latest_rate_value || activeLine.product.cost_price).toFixed(2)}</div>
                    <div>Tax</div>
                    <div className="text-right font-semibold">{Number(activeLine.product.tax_percent).toFixed(2)}%</div>
                    <div>HSN</div>
                    <div className="text-right font-semibold">{activeLine.product.hsn_code || "-"}</div>
                    <div>Line Qty</div>
                    <div className="text-right font-semibold">
                      {activeLine.quantity1 || 0} / {activeLine.quantity2 || 0} / {activeLine.quantity3 || 0}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div><span className="font-semibold text-foreground">Enter</span> move next</div>
                  <div><span className="font-semibold text-foreground">Arrow Up/Down</span> selector navigation</div>
                  <div><span className="font-semibold text-foreground">Esc</span> close current selector</div>
                  <div><span className="font-semibold text-foreground">F4</span> edit active product</div>
                  <div><span className="font-semibold text-foreground">Ctrl+S</span> save bill</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={paymentModeOpen} onOpenChange={setPaymentModeOpen}>
        <DialogContent className="max-w-sm border-0 bg-card p-0 font-mono">
          <DialogHeader className="border-b bg-[#6d9187] px-4 py-3 text-white">
            <DialogTitle className="text-sm uppercase tracking-[0.24em]">Select Mode</DialogTitle>
          </DialogHeader>
          <div className="p-2">
            {PAYMENT_MODE_OPTIONS.map((option, index) => (
              <button
                key={option}
                type="button"
                className={cn("flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold", index === paymentModeIndex ? "bg-[#2f5d50] text-white" : "hover:bg-muted")}
                onMouseEnter={() => setPaymentModeIndex(index)}
                onClick={() => {
                  setPaymentMode(option);
                  setPaymentModeOpen(false);
                  setTimeout(() => warehouseButtonRef.current?.focus(), 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPaymentModeIndex((prev) => (prev + 1) % PAYMENT_MODE_OPTIONS.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPaymentModeIndex((prev) => (prev - 1 + PAYMENT_MODE_OPTIONS.length) % PAYMENT_MODE_OPTIONS.length);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    setPaymentMode(option);
                    setPaymentModeOpen(false);
                    setTimeout(() => warehouseButtonRef.current?.focus(), 0);
                  }
                }}
                autoFocus={index === paymentModeIndex}
              >
                <span>{option}</span>
                {paymentMode === option ? <span>Selected</span> : null}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={rateUnitPicker !== null} onOpenChange={(open) => !open && setRateUnitPicker(null)}>
        <DialogContent className="max-w-sm border-0 bg-card p-0 font-mono">
          <DialogHeader className="border-b bg-[#6d9187] px-4 py-3 text-white">
            <DialogTitle className="text-sm uppercase tracking-[0.24em]">Select Unit</DialogTitle>
          </DialogHeader>
          <div className="p-2">
            {(rateUnitPicker ? [
              { level: 1 as const, label: lines[rateUnitPicker.rowIndex]?.product?.unit_1st_name || "1st", disabled: false },
              { level: 2 as const, label: lines[rateUnitPicker.rowIndex]?.product?.unit_2nd_name || "2nd", disabled: !lines[rateUnitPicker.rowIndex]?.product?.unit_2nd_name },
              { level: 3 as const, label: lines[rateUnitPicker.rowIndex]?.product?.unit_3rd_name || "3rd", disabled: !lines[rateUnitPicker.rowIndex]?.product?.unit_3rd_name },
            ].filter((option) => !option.disabled) : []).map((option, index, options) => (
              <button
                key={option.level}
                type="button"
                className={cn("flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold", rateUnitPicker?.optionIndex === index ? "bg-[#2f5d50] text-white" : "hover:bg-muted")}
                onMouseEnter={() => setRateUnitPicker((prev) => prev ? { ...prev, optionIndex: index } : prev)}
                onClick={() => {
                  if (!rateUnitPicker) return;
                  updateLine(rateUnitPicker.rowIndex, { rateUnitLevel: option.level });
                  setRateUnitPicker(null);
                  setTimeout(() => focusLineField(rateUnitPicker.rowIndex, "discountPercent"), 0);
                }}
                onKeyDown={(e) => {
                  if (!rateUnitPicker) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setRateUnitPicker((prev) => prev ? { ...prev, optionIndex: (prev.optionIndex + 1) % options.length } : prev);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setRateUnitPicker((prev) => prev ? { ...prev, optionIndex: (prev.optionIndex - 1 + options.length) % options.length } : prev);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    updateLine(rateUnitPicker.rowIndex, { rateUnitLevel: option.level });
                    setRateUnitPicker(null);
                    setTimeout(() => focusLineField(rateUnitPicker.rowIndex, "discountPercent"), 0);
                  }
                }}
                autoFocus={rateUnitPicker?.optionIndex === index}
              >
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={warehousePickerOpen} onOpenChange={setWarehousePickerOpen}>
        <DialogContent className="max-w-md border-0 bg-card p-0 font-mono">
          <DialogHeader className="border-b bg-[#6d9187] px-4 py-3 text-white">
            <DialogTitle className="text-sm uppercase tracking-[0.24em]">Select Warehouse</DialogTitle>
          </DialogHeader>
          <div className="p-2">
            {warehouses.map((warehouse, index) => (
              <button
                key={warehouse.id}
                type="button"
                className={cn("flex w-full items-center justify-between px-3 py-3 text-left text-sm font-semibold", warehouseIndex === index ? "bg-[#2f5d50] text-white" : "hover:bg-muted")}
                onMouseEnter={() => setWarehouseIndex(index)}
                onClick={() => {
                  setWarehouseId(warehouse.id);
                  setWarehousePickerOpen(false);
                  setTimeout(() => productCellRef.current?.focus(), 0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setWarehouseIndex((prev) => (prev + 1) % warehouses.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setWarehouseIndex((prev) => (prev - 1 + warehouses.length) % warehouses.length);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    setWarehouseId(warehouse.id);
                    setWarehousePickerOpen(false);
                    setTimeout(() => productCellRef.current?.focus(), 0);
                  }
                }}
                autoFocus={warehouseIndex === index}
              >
                <span>{warehouse.name}</span>
                <span>{warehouse.code}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="mt-3 rounded-2xl border bg-card px-4 py-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-mono">
          <span><span className="font-semibold text-foreground">Enter</span> move next</span>
          <span><span className="font-semibold text-foreground">Arrow Up/Down</span> selector navigation</span>
          <span><span className="font-semibold text-foreground">Esc</span> close selector</span>
          <span><span className="font-semibold text-foreground">F4</span> edit product</span>
          <span><span className="font-semibold text-foreground">Ctrl+S</span> save bill</span>
        </div>
      </div>

      {vendorSearchOpen ? (
        <div className="absolute inset-0 z-30 grid bg-card md:grid-cols-[1.2fr_0.9fr]">
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center justify-between border-b bg-[#6d9187] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
              <span>Vendor Selector</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 border-white/30 bg-transparent px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setVendorCreateOpen(true)}>+ Add Vendor</Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setVendorSearchOpen(false)}>Esc</Button>
              </div>
            </div>
            <div className="border-b bg-background p-3">
              <Input
                ref={vendorSearchRef}
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder="Type vendor name"
                className="h-11 border-0 bg-muted text-base font-semibold"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setVendorIndex((prev) => Math.min(prev + 1, vendorResults.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setVendorIndex((prev) => Math.max(prev - 1, 0));
                  }
                  if (e.key === "Enter" && vendorResults[vendorIndex]) {
                    e.preventDefault();
                    selectVendor(vendorResults[vendorIndex]);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] border-b bg-[#e6efcf] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
              <span>Ledger</span>
              <span className="text-right">Balance</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {vendorResults.map((vendor, index) => (
                <button
                  key={vendor.vendor_id}
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_120px] items-center border-b px-4 py-3 text-left text-sm",
                    index === vendorIndex ? "bg-[#2f5d50] text-white" : "hover:bg-muted/50"
                  )}
                  onMouseEnter={() => setVendorIndex(index)}
                  onClick={() => selectVendor(vendor)}
                >
                  <div>
                    <div className="font-semibold">{vendor.vendor_name}</div>
                    <div className={cn("mt-1 truncate text-xs", index === vendorIndex ? "text-white/80" : "text-muted-foreground")}>
                      {vendor.city || "-"} {vendor.state ? `• ${vendor.state}` : ""}
                    </div>
                  </div>
                  <span className="text-right font-semibold">{Number(vendor.balance).toFixed(2)} {vendor.balance_side}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto bg-[#f8faf7] p-4 text-sm">
            {vendorResults[vendorIndex] ? (
              <>
                <div className="text-lg font-semibold">{vendorResults[vendorIndex].vendor_name}</div>
                <div className="mt-2 text-muted-foreground">{vendorResults[vendorIndex].address_lines.join(", ")}</div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-background p-4 text-sm">
                  <div>GSTIN</div><div className="text-right font-semibold">{vendorResults[vendorIndex].gstin || "-"}</div>
                  <div>Phone</div><div className="text-right font-semibold">{vendorResults[vendorIndex].phone || "-"}</div>
                  <div>Area</div><div className="text-right font-semibold">{vendorResults[vendorIndex].area || "-"}</div>
                  <div>Route</div><div className="text-right font-semibold">{vendorResults[vendorIndex].route || "-"}</div>
                  <div>Brands</div><div className="text-right font-semibold">{vendorResults[vendorIndex].brand_names.length ? vendorResults[vendorIndex].brand_names.join(", ") : "None linked"}</div>
                  <div>Monthly Purchase</div><div className="text-right font-semibold">{Number(vendorResults[vendorIndex].monthly_purchase_amount).toFixed(2)}</div>
                  <div>Annual Purchase</div><div className="text-right font-semibold">{Number(vendorResults[vendorIndex].annual_purchase_amount).toFixed(2)}</div>
                  <div>Last Purchase</div><div className="text-right font-semibold">{vendorResults[vendorIndex].last_purchase_date ? formatDisplayDate(vendorResults[vendorIndex].last_purchase_date) : "-"}</div>
                  <div>Last Payment</div><div className="text-right font-semibold">{vendorResults[vendorIndex].last_payment_date ? formatDisplayDate(vendorResults[vendorIndex].last_payment_date) : "-"}</div>
                </div>
                <div className="mt-4 rounded-lg border bg-background p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Last 3 Bills</div>
                  <div className="space-y-2">
                    {vendorResults[vendorIndex].last_bills.map((bill) => (
                      <div key={`${bill.bill_number}-${bill.bill_date}`} className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs">
                        <span>{bill.bill_number}</span>
                        <span>{formatDisplayDate(bill.bill_date)}</span>
                        <span className="text-right font-semibold">{Number(bill.total_amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 rounded-lg border bg-background p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Available Challans</div>
                  <div className="space-y-2">
                    {vendorResults[vendorIndex].open_challans.length ? vendorResults[vendorIndex].open_challans.map((challan) => (
                      <div key={challan.challan_id} className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs">
                        <span>{challan.reference_no}</span>
                        <span>{challan.challan_date ? formatDisplayDate(challan.challan_date) : "-"}</span>
                        <span className="text-right font-semibold">{challan.item_count} items</span>
                      </div>
                    )) : <div className="text-xs text-muted-foreground">No open challans.</div>}
                  </div>
                </div>
              </>
            ) : <div className="text-muted-foreground">No vendor selected.</div>}
          </div>
        </div>
      ) : null}

      {productSearchOpen ? (
        <div className="absolute inset-0 z-30 grid bg-card md:grid-cols-[1.25fr_0.95fr]">
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center justify-between border-b bg-[#6d9187] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
              <span>Product Selector</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 border-white/30 bg-transparent px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => { setProductTargetRow(activeRow); setProductCreateOpen(true); }}>+ Add Product</Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setProductSearchOpen(false)}>Esc</Button>
              </div>
            </div>
            <div className="border-b bg-background p-3">
              <Input
                ref={productSearchRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Type product name, sku or brand"
                className="h-11 border-0 bg-muted text-base font-semibold"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setProductIndex((prev) => Math.min(prev + 1, productResults.length - 1));
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setProductIndex((prev) => Math.max(prev - 1, 0));
                  }
                  if (e.key === "Enter" && productResults[productIndex]) {
                    e.preventDefault();
                    selectProduct(productResults[productIndex], productTargetRow);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_130px_130px] border-b bg-[#e6efcf] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
              <span>Description</span>
              <span className="text-right">Stock</span>
              <span className="text-right">Rate</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {productResults.length ? (
                productResults.map((product, index) => (
                  <button
                    key={product.product_id}
                    type="button"
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_130px_130px] items-center border-b px-4 py-3 text-left text-sm",
                      index === productIndex ? "bg-[#2f5d50] text-white" : "hover:bg-muted/50"
                    )}
                    onMouseEnter={() => setProductIndex(index)}
                    onClick={() => selectProduct(product, productTargetRow)}
                  >
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className={cn("mt-1 truncate text-xs", index === productIndex ? "text-white/80" : "text-muted-foreground")}>
                        {product.sku}{product.brand ? ` • ${product.brand}` : ""}
                      </div>
                    </div>
                    <span className="text-right font-semibold">{product.stock_ratio}</span>
                    <span className="text-right font-semibold">{Number(product.latest_rate_value || product.cost_price).toFixed(2)}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-6 text-sm text-muted-foreground">No products found for this search.</div>
              )}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto bg-[#f8faf7] p-4 text-sm">
            {productResults[productIndex] ? (
              <>
                <div className="text-lg font-semibold">{productResults[productIndex].name}</div>
                <div className="mt-2 text-muted-foreground">{productResults[productIndex].description || "-"}</div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-background p-4 text-sm">
                  <div>Stock</div><div className="text-right font-semibold">{productResults[productIndex].stock_ratio}</div>
                  <div>Units</div><div className="text-right font-semibold">{[productResults[productIndex].unit_1st_name, productResults[productIndex].unit_2nd_name, productResults[productIndex].unit_3rd_name].filter(Boolean).join(" / ")}</div>
                  <div>MRP</div><div className="text-right font-semibold">{Number(productResults[productIndex].mrp).toFixed(2)}</div>
                  <div>Price</div><div className="text-right font-semibold">{Number(productResults[productIndex].latest_rate_value || productResults[productIndex].cost_price).toFixed(2)}</div>
                  <div>Tax</div><div className="text-right font-semibold">{Number(productResults[productIndex].tax_percent).toFixed(2)}%</div>
                  <div>HSN</div><div className="text-right font-semibold">{productResults[productIndex].hsn_code || "-"}</div>
                </div>
                <div className="mt-4 rounded-lg border bg-background p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Recent Bills</div>
                  <div className="space-y-2">
                    {productResults[productIndex].recent_bills.map((bill) => (
                      <div key={`${bill.bill_number}-${bill.bill_date}`} className="grid grid-cols-[1fr_auto_auto] gap-2 text-xs">
                        <span>{bill.bill_number}</span>
                        <span>{formatDisplayDate(bill.bill_date)}</span>
                        <span className="text-right font-semibold">{Number(bill.line_total_amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : <div className="text-muted-foreground">No product selected.</div>}
          </div>
        </div>
      ) : null}

      <Dialog open={productEditOpen} onOpenChange={setProductEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader><DialogTitle>Modify Product</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>SKU</Label><Input value={productEditForm.sku} onChange={(e) => setProductEditForm((prev) => ({ ...prev, sku: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Name</Label><Input value={productEditForm.name} onChange={(e) => setProductEditForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Description</Label><Textarea value={productEditForm.description} onChange={(e) => setProductEditForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} /></div>
            <div className="space-y-1">
              <Label>HSN</Label>
              <select className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productEditForm.hsn_id} onChange={(e) => setProductEditForm((prev) => ({ ...prev, hsn_id: e.target.value, tax_percent: hsnOptions.find((item) => item.id === e.target.value)?.gst_percent || prev.tax_percent }))}>
                <option value="">Select HSN</option>
                {hsnOptions.map((item) => <option key={item.id} value={item.id}>{item.hsn_code}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>GST %</Label><Input value={productEditForm.tax_percent} onChange={(e) => setProductEditForm((prev) => ({ ...prev, tax_percent: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Primary Unit</Label>
              <select className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productEditForm.primary_unit_id} onChange={(e) => setProductEditForm((prev) => ({ ...prev, primary_unit_id: e.target.value }))}>
                <option value="">Select unit</option>
                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.unit_code} - {item.unit_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Secondary Unit</Label>
              <select className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productEditForm.secondary_unit_id} onChange={(e) => setProductEditForm((prev) => ({ ...prev, secondary_unit_id: e.target.value }))}>
                <option value="">Optional</option>
                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.unit_code} - {item.unit_name}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>1 second = ? first</Label><Input value={productEditForm.secondary_unit_quantity} onChange={(e) => setProductEditForm((prev) => ({ ...prev, secondary_unit_quantity: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Third Unit</Label>
              <select className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productEditForm.third_unit_id} onChange={(e) => setProductEditForm((prev) => ({ ...prev, third_unit_id: e.target.value }))}>
                <option value="">Optional</option>
                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.unit_code} - {item.unit_name}</option>)}
              </select>
            </div>
            <div className="space-y-1"><Label>1 third = ? second</Label><Input value={productEditForm.third_unit_quantity} onChange={(e) => setProductEditForm((prev) => ({ ...prev, third_unit_quantity: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Weight in grams</Label><Input value={productEditForm.weight_in_grams} onChange={(e) => setProductEditForm((prev) => ({ ...prev, weight_in_grams: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button onClick={() => void saveProductEdit()}>Save Product</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorCreateOpen} onOpenChange={(open) => {
        setVendorCreateOpen(open);
        if (!open) {
          setTimeout(() => vendorButtonRef.current?.focus(), 0);
        }
      }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-none border border-[#5f8277] bg-[#fcfdf8] font-mono sm:max-w-4xl">
          <DialogHeader className="-m-6 mb-4 border-b border-[#5f8277] bg-[#6d9187] px-6 py-3 text-white">
            <DialogTitle className="text-sm uppercase tracking-[0.24em]">Add Vendor</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2"><Label>Firm Name</Label><Input ref={setVendorCreateRef("firm_name")} value={vendorCreateForm.firm_name} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, firm_name: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "firm_name")} /></div>
            <div className="space-y-1"><Label>Type</Label><select ref={setVendorCreateRef("purchase_type")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={vendorCreateForm.purchase_type} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, purchase_type: e.target.value as "LOCAL" | "CENTRAL" }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "purchase_type")}><option value="CENTRAL">CENTRAL</option><option value="LOCAL">LOCAL</option></select></div>
            <div className="space-y-1"><Label>GSTIN</Label><Input ref={setVendorCreateRef("gstin")} value={vendorCreateForm.gstin} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, gstin: e.target.value, purchase_type: derivePurchaseTypeFromGstin(e.target.value) }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "gstin")} /></div>
            <div className="space-y-1"><Label>PAN</Label><Input ref={setVendorCreateRef("pan")} value={vendorCreateForm.pan} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, pan: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "pan")} /></div>
            <div className="space-y-1"><Label>Owner Name</Label><Input ref={setVendorCreateRef("owner_name")} value={vendorCreateForm.owner_name} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, owner_name: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "owner_name")} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input ref={setVendorCreateRef("phone")} value={vendorCreateForm.phone} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, phone: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "phone")} /></div>
            <div className="space-y-1"><Label>Alternate Phone</Label><Input ref={setVendorCreateRef("alternate_phone")} value={vendorCreateForm.alternate_phone} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, alternate_phone: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "alternate_phone")} /></div>
            <div className="space-y-1"><Label>Email</Label><Input ref={setVendorCreateRef("email")} value={vendorCreateForm.email} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, email: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "email")} /></div>
            <div className="space-y-1 md:col-span-2"><Label>Street</Label><Input ref={setVendorCreateRef("street")} value={vendorCreateForm.street} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, street: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "street")} /></div>
            <div className="space-y-1"><Label>City</Label><Input ref={setVendorCreateRef("city")} value={vendorCreateForm.city} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, city: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "city")} /></div>
            <div className="space-y-1"><Label>State</Label><Input ref={setVendorCreateRef("state")} value={vendorCreateForm.state} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, state: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "state")} /></div>
            <div className="space-y-1"><Label>Pincode</Label><Input ref={setVendorCreateRef("pincode")} value={vendorCreateForm.pincode} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, pincode: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "pincode")} /></div>
            <div className="space-y-1"><Label>Bank Account Number</Label><Input ref={setVendorCreateRef("bank_account_number")} value={vendorCreateForm.bank_account_number} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, bank_account_number: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "bank_account_number")} /></div>
            <div className="space-y-1"><Label>IFSC Code</Label><Input ref={setVendorCreateRef("ifsc_code")} value={vendorCreateForm.ifsc_code} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, ifsc_code: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "ifsc_code")} /></div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Account Category</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setVendorCategoryCreateOpen(true)}>+ Add Account Category</Button>
              </div>
              <select ref={setVendorCreateRef("account_category_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={vendorCreateForm.account_category_id} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, account_category_id: e.target.value }))} onKeyDown={(e) => handleVendorCreateKeyDown(e, "account_category_id")}><option value="">Optional</option>{vendorCategoryOptions.map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}</select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Brands</Label>
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-3 md:grid-cols-2">
                {brandOptions.map((brand) => (
                  <label key={brand.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={vendorCreateForm.brand_ids.includes(brand.id)} onChange={(e) => setVendorCreateForm((prev) => ({ ...prev, brand_ids: e.target.checked ? [...prev.brand_ids, brand.id] : prev.brand_ids.filter((id) => id !== brand.id) }))} />
                    <span>{brand.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button ref={vendorCreateSaveRef} type="button" disabled={creatingVendor || !vendorCreateForm.firm_name.trim()} onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void (e.currentTarget as HTMLButtonElement).click();
              }
            }} onClick={async () => {
              setCreatingVendor(true);
              try {
                const created = asObject(await postBackend("/masters/vendors", {
                  firm_name: vendorCreateForm.firm_name.trim(),
                  purchase_type: vendorCreateForm.purchase_type,
                  gstin: vendorCreateForm.gstin.trim() || null,
                  pan: vendorCreateForm.pan.trim() || null,
                  owner_name: vendorCreateForm.owner_name.trim() || null,
                  phone: vendorCreateForm.phone.trim() || null,
                  alternate_phone: vendorCreateForm.alternate_phone.trim() || null,
                  email: vendorCreateForm.email.trim() || null,
                  street: vendorCreateForm.street.trim() || null,
                  city: vendorCreateForm.city.trim() || null,
                  state: vendorCreateForm.state.trim() || null,
                  pincode: vendorCreateForm.pincode.trim() || null,
                  bank_account_number: vendorCreateForm.bank_account_number.trim() || null,
                  ifsc_code: vendorCreateForm.ifsc_code.trim() || null,
                  account_category_id: vendorCreateForm.account_category_id || null,
                  brand_ids: vendorCreateForm.brand_ids,
                }));
                const createdSummary = mapVendorSummary(asObject(await fetchBackend(`/procurement/purchase-entry/vendors/${String(created.id ?? "")}/summary`)));
                setVendorCreateOpen(false);
                setVendorCreateForm({ ...EMPTY_VENDOR_FORM });
                setVendorSummary(createdSummary);
                setVendorSearchOpen(false);
                toast.success("Vendor created");
                setTimeout(() => billNumberRef.current?.focus(), 0);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create vendor");
              } finally {
                setCreatingVendor(false);
              }
            }}>{creatingVendor ? "Saving..." : "Save Vendor"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={productCreateOpen} onOpenChange={(open) => {
        setProductCreateOpen(open);
        if (!open) {
          setTimeout(() => focusLineField(productTargetRow, "product"), 0);
        }
      }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-none border border-[#5f8277] bg-[#fcfdf8] font-mono sm:max-w-5xl">
          <DialogHeader className="-m-6 mb-4 border-b border-[#5f8277] bg-[#6d9187] px-6 py-3 text-white">
            <DialogTitle className="text-sm uppercase tracking-[0.24em]">Add Product</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1"><Label>SKU *</Label><Input ref={setProductCreateRef("sku")} value={productCreateForm.sku} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, sku: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "sku")} /></div>
            <div className="space-y-1"><Label>Name *</Label><Input ref={setProductCreateRef("name")} value={productCreateForm.name} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, name: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "name")} /></div>
            <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>Brand</Label><Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateType("brand")}>+ Add Brand</Button></div><select ref={setProductCreateRef("brand_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.brand_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, brand_id: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "brand_id")}><option value="">Select brand</option>{brandOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
            <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>Category</Label><Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateType("category")}>+ Add Category</Button></div><select ref={setProductCreateRef("category_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.category_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, category_id: e.target.value, sub_category_id: "" }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "category_id")}><option value="">Select category</option>{categoryOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
            <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>Sub Category</Label><Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateType("subCategory")}>+ Add Sub Category</Button></div><select ref={setProductCreateRef("sub_category_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.sub_category_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, sub_category_id: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "sub_category_id")}><option value="">Select sub category</option>{(productCreateForm.category_id ? subCategoryOptions.filter((option) => !option.category_id || option.category_id === productCreateForm.category_id) : subCategoryOptions).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></div>
            <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>HSN</Label><Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateType("hsn")}>+ Add HSN</Button></div><select ref={setProductCreateRef("hsn_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.hsn_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, hsn_id: e.target.value, tax_percent: hsnOptions.find((item) => item.id === e.target.value)?.gst_percent || prev.tax_percent }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "hsn_id")}><option value="">Select HSN</option>{hsnOptions.map((option) => <option key={option.id} value={option.id}>{option.hsn_code} ({option.gst_percent}%)</option>)}</select></div>
            <div className="space-y-1 md:col-span-2"><Label>Description</Label><Textarea ref={setProductCreateRef("description")} value={productCreateForm.description} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, description: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "description")} /></div>
            <div className="space-y-1"><div className="flex items-center justify-between gap-2"><Label>Primary Unit *</Label><Button type="button" variant="outline" size="sm" onClick={() => setQuickCreateType("unit")}>+ Add Unit</Button></div><select ref={setProductCreateRef("primary_unit_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.primary_unit_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, primary_unit_id: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "primary_unit_id")}><option value="">Select primary unit</option>{unitOptions.map((option) => <option key={option.id} value={option.id}>{option.unit_code} - {option.unit_name}</option>)}</select></div>
            <div className="space-y-1"><Label>Secondary Unit</Label><select ref={setProductCreateRef("secondary_unit_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.secondary_unit_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, secondary_unit_id: e.target.value, third_unit_id: e.target.value ? prev.third_unit_id : "", secondary_unit_quantity: e.target.value ? prev.secondary_unit_quantity : "", third_unit_quantity: e.target.value ? prev.third_unit_quantity : "" }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "secondary_unit_id")}><option value="">Optional</option>{unitOptions.map((option) => <option key={option.id} value={option.id}>{option.unit_code} - {option.unit_name}</option>)}</select></div>
            {productCreateForm.secondary_unit_id ? <div className="space-y-1"><Label>How many primary units in second unit</Label><Input ref={setProductCreateRef("secondary_unit_quantity")} value={productCreateForm.secondary_unit_quantity} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, secondary_unit_quantity: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "secondary_unit_quantity")} /></div> : null}
            <div className="space-y-1"><Label>Third Unit</Label><select ref={setProductCreateRef("third_unit_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={productCreateForm.third_unit_id} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, third_unit_id: e.target.value, third_unit_quantity: e.target.value ? prev.third_unit_quantity : "" }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "third_unit_id")}><option value="">{productCreateForm.secondary_unit_id ? "Optional" : "Select secondary unit first"}</option>{unitOptions.map((option) => <option key={option.id} value={option.id}>{option.unit_code} - {option.unit_name}</option>)}</select></div>
            {productCreateForm.third_unit_id ? <div className="space-y-1"><Label>How many second units in third unit</Label><Input ref={setProductCreateRef("third_unit_quantity")} value={productCreateForm.third_unit_quantity} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, third_unit_quantity: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "third_unit_quantity")} /></div> : null}
            <div className="space-y-1"><Label>Weight in grams</Label><Input ref={setProductCreateRef("weight_in_grams")} value={productCreateForm.weight_in_grams} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, weight_in_grams: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "weight_in_grams")} /></div>
            <div className="space-y-1"><Label>GST / Tax % *</Label><Input ref={setProductCreateRef("tax_percent")} value={productCreateForm.tax_percent} onChange={(e) => setProductCreateForm((prev) => ({ ...prev, tax_percent: e.target.value }))} onKeyDown={(e) => handleProductCreateKeyDown(e, "tax_percent")} /></div>
          </div>
          <div className="flex justify-end">
            <Button ref={productCreateSaveRef} type="button" disabled={creatingProduct || !productCreateForm.sku.trim() || !productCreateForm.name.trim() || !productCreateForm.primary_unit_id || !productCreateForm.tax_percent.trim()} onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void (e.currentTarget as HTMLButtonElement).click();
              }
            }} onClick={async () => {
              setCreatingProduct(true);
              try {
                const created = asObject(await postBackend("/masters/products", {
                  sku: productCreateForm.sku.trim(),
                  name: productCreateForm.name.trim(),
                  brand_id: productCreateForm.brand_id || null,
                  category_id: productCreateForm.category_id || null,
                  sub_category_id: productCreateForm.sub_category_id || null,
                  description: productCreateForm.description.trim() || null,
                  hsn_id: productCreateForm.hsn_id || null,
                  primary_unit_id: productCreateForm.primary_unit_id || null,
                  secondary_unit_id: productCreateForm.secondary_unit_id || null,
                  third_unit_id: productCreateForm.third_unit_id || null,
                  secondary_unit_quantity: productCreateForm.secondary_unit_id ? toNullableNumber(productCreateForm.secondary_unit_quantity) : null,
                  third_unit_quantity: productCreateForm.third_unit_id ? toNullableNumber(productCreateForm.third_unit_quantity) : null,
                  weight_in_grams: toNullableNumber(productCreateForm.weight_in_grams),
                  tax_percent: Number(productCreateForm.tax_percent || "0"),
                }));
                const createdSummary = mapProductSummary(asObject(await fetchBackend(`/procurement/purchase-entry/products/${String(created.id ?? "")}/summary`)));
                setProductCreateOpen(false);
                setProductCreateForm({ ...EMPTY_PRODUCT_FORM });
                selectProduct(createdSummary, productTargetRow);
                toast.success("Product created");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create product");
              } finally {
                setCreatingProduct(false);
              }
            }}>{creatingProduct ? "Saving..." : "Save Product"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={quickCreateType !== ""} onOpenChange={(open) => !open && setQuickCreateType("")}>
        <DialogContent className="sm:max-w-lg">
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
          <div className="grid gap-3">
            {quickCreateType === "unit" || quickCreateType === "hsn" ? (
              <div className="space-y-1">
                <Label>{quickCreateType === "unit" ? "Code" : "HSN Number"}</Label>
                <Input value={quickCode} onChange={(e) => setQuickCode(e.target.value)} />
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
                <select
                  className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={quickCategoryId}
                  onChange={(e) => setQuickCategoryId(e.target.value)}
                >
                  <option value="">Optional</option>
                  {categoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setQuickCreateType("")}>Cancel</Button>
            <Button
              type="button"
              onClick={() => void quickCreateProductMaster()}
              disabled={
                quickCreating ||
                ((quickCreateType === "brand" || quickCreateType === "category" || quickCreateType === "subCategory" || quickCreateType === "unit") &&
                  !quickName.trim()) ||
                ((quickCreateType === "unit" || quickCreateType === "hsn") && !quickCode.trim())
              }
            >
              {quickCreating ? "Creating..." : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={vendorCategoryCreateOpen} onOpenChange={setVendorCategoryCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Vendor Account Category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={vendorCategoryForm.code} onChange={(e) => setVendorCategoryForm((prev) => ({ ...prev, code: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={vendorCategoryForm.name} onChange={(e) => setVendorCategoryForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={vendorCategoryForm.description} onChange={(e) => setVendorCategoryForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setVendorCategoryCreateOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => void createInlineVendorCategory()}
              disabled={creatingVendorCategory || !vendorCategoryForm.code.trim() || !vendorCategoryForm.name.trim()}
            >
              {creatingVendorCategory ? "Adding..." : "Add Account Category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader><DialogTitle>Vendor Ledger</DialogTitle></DialogHeader>
          <div className="rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledgerRows.map((row) => (
                  <TableRow key={row.entry_id}>
                    <TableCell>{formatDisplayDate(row.entry_date)}</TableCell>
                    <TableCell>{row.description}</TableCell>
                    <TableCell className="text-right">{Number(row.admin_debit).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.admin_credit).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(row.running_balance).toFixed(2)} {row.balance_side}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
