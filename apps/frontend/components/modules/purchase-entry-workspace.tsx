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

type WarehouseOption = { id: string; name: string; code: string };
type VendorSummary = {
  vendor_id: string;
  vendor_name: string;
  address_lines: string[];
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
  base_price: string;
  tax_percent: string;
};

type UnitOption = { id: string; unit_code: string; unit_name: string };
type HsnOption = { id: string; hsn_code: string; gst_percent: string };

type LineDraft = {
  id: string;
  product: ProductSummary | null;
  quantity1: string;
  quantity2: string;
  quantity3: string;
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
  base_price: "",
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

function makeLine(): LineDraft {
  return {
    id: crypto.randomUUID(),
    product: null,
    quantity1: "",
    quantity2: "",
    quantity3: "",
    rateValue: "",
    rateUnitLevel: 1,
    discountPercent: "",
    discountLumpsum: "",
    amount: "0.00",
  };
}

type LineField = "product" | "quantity1" | "quantity2" | "quantity3" | "rateValue" | "rateUnitLevel" | "discountPercent";
const LINE_FIELD_ORDER: LineField[] = ["product", "quantity1", "quantity2", "quantity3", "rateValue", "rateUnitLevel", "discountPercent"];

function deriveTaxType(warehouseState?: string | null, vendorState?: string | null) {
  return (warehouseState || "").trim().toUpperCase() === (vendorState || "").trim().toUpperCase() ? "LOCAL" : "CENTRAL";
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
  const discountLumpsum = asDecimal(line.discountLumpsum);
  const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
  const taxable = subtotal - discountAmount;
  const tax = taxable * (asDecimal(line.product.tax_percent) / 100);
  return Math.max(0, taxable + tax);
}

function mapVendorSummary(row: Record<string, unknown>): VendorSummary {
  return {
    vendor_id: String(row.vendor_id ?? ""),
    vendor_name: String(row.vendor_name ?? ""),
    address_lines: Array.isArray(row.address_lines) ? row.address_lines.map((item) => String(item)) : [],
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

export function PurchaseEntryWorkspace() {
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
  const [lines, setLines] = useState<LineDraft[]>([makeLine(), makeLine(), makeLine(), makeLine(), makeLine()]);
  const [saving, setSaving] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerRows, setLedgerRows] = useState<LedgerEntry[]>([]);
  const [productEditOpen, setProductEditOpen] = useState(false);
  const [productEditForm, setProductEditForm] = useState<ProductEditForm>(EMPTY_PRODUCT_EDIT);
  const [hsnOptions, setHsnOptions] = useState<HsnOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const billDateRef = useRef<HTMLInputElement | null>(null);
  const billNumberRef = useRef<HTMLInputElement | null>(null);
  const receivedDateRef = useRef<HTMLInputElement | null>(null);
  const paymentModeRef = useRef<HTMLSelectElement | null>(null);
  const vendorSearchRef = useRef<HTMLInputElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const productCellRef = useRef<HTMLButtonElement | null>(null);
  const vendorButtonRef = useRef<HTMLButtonElement | null>(null);
  const lineRefs = useRef<Record<string, HTMLInputElement | HTMLButtonElement | HTMLSelectElement | null>>({});

  const activeLine = lines[activeRow] ?? null;

  const setLineRef = useCallback((rowId: string, field: LineField) => {
    return (node: HTMLInputElement | HTMLButtonElement | HTMLSelectElement | null) => {
      lineRefs.current[`${rowId}:${field}`] = node;
    };
  }, []);

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
      const discountLumpsum = asDecimal(line.discountLumpsum);
      const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
      return sum + Math.max(0, subtotal - discountAmount);
    }, 0);
    const gst = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
      const discountLumpsum = asDecimal(line.discountLumpsum);
      const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
      const taxable = Math.max(0, subtotal - discountAmount);
      return sum + taxable * (asDecimal(line.product.tax_percent) / 100);
    }, 0);
    const discount = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || line.product.latest_discount_percent || "0");
      const discountLumpsum = asDecimal(line.discountLumpsum);
      return sum + subtotal * (discountPercent / 100) + discountLumpsum;
    }, 0);
    const freight = asDecimal(freightAmount);
    const finalAmount = valueOfGoods + gst + freight;
    return { valueOfGoods, discount, gst, freight, finalAmount };
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
      }));
      setWarehouses(warehouseItems);
      setWarehouseId(String(bootstrap.default_warehouse_id ?? warehouseItems[0]?.id ?? ""));
      setEntryNumber(String(bootstrap.next_entry_number ?? ""));
      setBillNumber(String(bootstrap.next_entry_number ?? ""));
      setHsnOptions(asArray(asObject(hsnRes).items).map((item) => ({ id: String(item.id ?? ""), hsn_code: String(item.hsn_code ?? ""), gst_percent: String(item.gst_percent ?? "0") })));
      setUnitOptions(asArray(asObject(unitRes).items).map((item) => ({ id: String(item.id ?? ""), unit_code: String(item.unit_code ?? ""), unit_name: String(item.unit_name ?? "") })));
      const activeWarehouse = asArray(asObject(warehouseRes).items).find((item) => String(item.id ?? "") === String(bootstrap.default_warehouse_id ?? "")) ?? asArray(asObject(warehouseRes).items)[0];
      setWarehouseState(activeWarehouse?.state ? String(activeWarehouse.state) : null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load purchase entry");
    } finally {
      setLoading(false);
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
    if (!loading) {
      billDateRef.current?.focus();
      billDateRef.current?.select();
    }
  }, [loading]);

  useEffect(() => {
    if (!vendorSearchOpen) return;
    void searchVendors(vendorSearch);
  }, [vendorSearchOpen, vendorSearch, searchVendors]);

  useEffect(() => {
    if (!productSearchOpen) return;
    void searchProducts(productSearch);
  }, [productSearchOpen, productSearch, searchProducts]);

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
      if (vendorSearchOpen) {
        event.preventDefault();
        setVendorSearchOpen(false);
        setTimeout(() => vendorButtonRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeRow, focusLineField, productSearchOpen, vendorSearchOpen]);

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
    setTaxType(deriveTaxType(warehouseState, vendor.state) as "LOCAL" | "CENTRAL");
    setVendorSearchOpen(false);
    setVendorSearch("");
    setTimeout(() => billNumberRef.current?.focus(), 0);
  }, [warehouseState]);

  const updateLine = useCallback((index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, idx) => {
      if (idx !== index) return line;
      const next = { ...line, ...patch };
      return { ...next, amount: computeLineAmount(next).toFixed(2) };
    }));
  }, []);

  const ensureTrailingEmptyLine = useCallback(() => {
    setLines((prev) => (prev.some((line) => line.product === null) ? prev : [...prev, makeLine()]));
  }, []);

  const selectProduct = useCallback((product: ProductSummary) => {
    updateLine(activeRow, {
      product,
      rateValue: product.latest_rate_value || product.cost_price || "0",
      rateUnitLevel: (product.latest_rate_unit_level as 1 | 2 | 3 | null) ?? 1,
      discountPercent: product.latest_discount_percent || "0",
    });
    setProductSearchOpen(false);
    setProductSearch("");
    ensureTrailingEmptyLine();
    setTimeout(() => focusLineField(activeRow, "quantity1"), 0);
  }, [activeRow, ensureTrailingEmptyLine, focusLineField, updateLine]);

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
      base_price: full.cost_price,
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
        base_price: Number(productEditForm.base_price || 0),
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

  const saveBill = useCallback(async () => {
    if (!vendorSummary) {
      toast.error("Select vendor");
      return;
    }
    const validLines = lines.filter((line) => line.product && lineBaseQuantity(line) > 0);
    if (!validLines.length) {
      toast.error("Add at least one product line");
      return;
    }
    const proceed = window.confirm(`Save purchase bill ${billNumber} for ${vendorSummary.vendor_name}?`);
    if (!proceed) return;
    setSaving(true);
    try {
      await postBackend("/procurement/purchase-entry", {
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
          damaged_quantity: 0,
          unit_price: lineUnitPrice(line),
          rate_value: Number(line.rateValue || 0),
          rate_unit_level: line.rateUnitLevel,
          discount_percent: Number(line.discountPercent || 0),
          discount_lumpsum: Number(line.discountLumpsum || 0),
          line_total_amount: Number(computeLineAmount(line).toFixed(2)),
        })),
      });
      toast.success("Purchase bill saved");
      await showLedger();
      setLines([makeLine(), makeLine(), makeLine(), makeLine(), makeLine()]);
      setNotes("");
      setFreightAmount("0");
      setActiveRow(0);
      setEntryNumber(`${entryNumber}-N`);
      setBillNumber(`${billNumber}-N`);
      setTimeout(() => productCellRef.current?.focus(), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save purchase bill");
    } finally {
      setSaving(false);
    }
  }, [billDate, billNumber, entryNumber, freightAmount, lines, notes, paymentMode, receivedDate, showLedger, taxType, vendorSummary, warehouseId]);

  const moveGridFocus = useCallback((rowIndex: number, field: LineField) => {
    setActiveRow(rowIndex);
    setActiveField(field);
    setTimeout(() => focusLineField(rowIndex, field), 0);
  }, [focusLineField]);

  const navigateGridByDelta = useCallback((rowIndex: number, field: LineField, rowDelta: number, colDelta: number) => {
    const currentCol = LINE_FIELD_ORDER.indexOf(field);
    const nextRow = Math.max(0, Math.min(lines.length - 1, rowIndex + rowDelta));
    const nextCol = Math.max(0, Math.min(LINE_FIELD_ORDER.length - 1, currentCol + colDelta));
    moveGridFocus(nextRow, LINE_FIELD_ORDER[nextCol]);
  }, [lines.length, moveGridFocus]);

  const handleLineFieldEnter = useCallback((event: ReactKeyboardEvent, rowIndex: number, field: LineField) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (field === "product") {
      setActiveRow(rowIndex);
      setActiveField("product");
      setProductSearchOpen(true);
      return;
    }
    if (field === "quantity1") {
      moveGridFocus(rowIndex, "quantity2");
      return;
    }
    if (field === "quantity2") {
      moveGridFocus(rowIndex, "quantity3");
      return;
    }
    if (field === "quantity3") {
      moveGridFocus(rowIndex, "rateValue");
      return;
    }
    if (field === "rateValue") {
      moveGridFocus(rowIndex, "rateUnitLevel");
      return;
    }
    if (field === "rateUnitLevel") {
      moveGridFocus(rowIndex, "discountPercent");
      return;
    }
    if (field === "discountPercent") {
      const nextRow = rowIndex + 1;
      setActiveRow(nextRow);
      setActiveField("product");
      setTimeout(() => focusLineField(nextRow, "product"), 0);
    }
  }, [focusLineField, moveGridFocus]);

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
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, 1, 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, -1, 0);
    }
  }, [handleLineFieldEnter, navigateGridByDelta]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F4" && activeLine?.product) {
        event.preventDefault();
        void openProductEdit(activeLine.product);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveBill();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeLine, openProductEdit, saveBill]);

  if (loading) {
    return <div className="rounded-xl border bg-card px-4 py-10 text-sm text-muted-foreground">Loading purchase entry...</div>;
  }

  return (
    <div className="font-mono">
      <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="border-b bg-[#6d9187] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.24em] text-white">
          Purchase Entry Console
        </div>
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="border-r">
            {vendorSummary ? (
              <div className="grid gap-px border-b bg-border md:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
                <div className="bg-background px-4 py-3">
                  <div className="truncate text-lg font-semibold">{vendorSummary.vendor_name} <span className="text-primary">[{paymentMode}]</span></div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{vendorSummary.address_lines.join(", ")}</div>
                </div>
                <div className="bg-background px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Balance</div>
                  <div className="mt-1 font-semibold">{Number(vendorSummary.balance).toFixed(2)} {vendorSummary.balance_side}</div>
                </div>
                <div className="bg-background px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Last Purc</div>
                  <div className="mt-1 font-semibold">{vendorSummary.last_purchase_date ? formatDisplayDate(vendorSummary.last_purchase_date) : "-"}</div>
                </div>
                <div className="bg-background px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Last Pay</div>
                  <div className="mt-1 font-semibold">{vendorSummary.last_payment_date ? formatDisplayDate(vendorSummary.last_payment_date) : "-"}</div>
                </div>
                <div className="bg-background px-4 py-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Month</div>
                  <div className="mt-1 font-semibold">{Number(vendorSummary.monthly_purchase_amount).toFixed(2)}</div>
                </div>
              </div>
            ) : null}

            <div className="grid gap-px bg-border md:grid-cols-12">
              <div className="bg-background p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Date</Label>
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
                  className="mt-2 h-11 rounded-md border-0 bg-muted text-lg font-semibold tracking-[0.18em]"
                />
              </div>
              <div className="bg-background p-2.5 md:col-span-4">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Party</Label>
                <Button
                  ref={vendorButtonRef}
                  type="button"
                  variant="ghost"
                  className="mt-2 h-11 w-full justify-start rounded-md border bg-muted px-3 text-left text-base font-semibold"
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
              <div className="bg-background p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Party No</Label>
                <Input ref={billNumberRef} value={billNumber} onChange={(e) => setBillNumber(e.target.value)} onKeyDown={(e) => e.key === "Enter" && receivedDateRef.current?.focus()} className="mt-2 h-11 rounded-md border-0 bg-muted text-base font-semibold" />
              </div>
              <div className="bg-background p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Dt</Label>
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
                  className="mt-2 h-11 rounded-md border-0 bg-muted text-base font-semibold tracking-[0.12em]"
                />
              </div>
              <div className="bg-background p-2.5 md:col-span-2">
                <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Mode</Label>
                <select
                  ref={paymentModeRef}
                  className="mt-2 h-11 w-full rounded-md border-0 bg-muted px-3 text-base font-semibold"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as "CREDIT" | "CASH")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      productCellRef.current?.focus();
                    }
                  }}
                >
                  <option value="CREDIT">CREDIT</option>
                  <option value="CASH">CASH</option>
                </select>
              </div>
            </div>

            <div className="grid gap-px border-t bg-border md:grid-cols-12">
              <div className="bg-background p-2.5 md:col-span-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Station</div>
                <div className="mt-2 text-sm font-semibold">{warehouses.find((warehouse) => warehouse.id === warehouseId)?.name || "-"}</div>
              </div>
              <div className="bg-background p-2.5 md:col-span-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Entry No</div>
                <Input value={entryNumber} onChange={(e) => setEntryNumber(e.target.value)} className="mt-2 h-10 rounded-md border-0 bg-muted text-sm font-semibold" />
              </div>
              <div className="bg-background p-2.5 md:col-span-2">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Type</div>
                <div className="mt-2 rounded-md bg-muted px-3 py-2 text-sm font-semibold">{taxType}</div>
              </div>
              <div className="bg-background p-2.5 md:col-span-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Warehouse</div>
                <select
                  className="mt-2 h-10 w-full rounded-md border-0 bg-muted px-3 text-sm font-semibold"
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#e6efcf] hover:bg-[#e6efcf]">
                    <TableHead className="w-[44px] text-center text-sm font-semibold text-foreground">#</TableHead>
                    <TableHead className="w-[36%] text-sm font-semibold text-foreground">PRODUCT</TableHead>
                    <TableHead className="text-center text-sm font-semibold text-foreground">{activeLine?.product?.unit_1st_name || "1st"}</TableHead>
                    <TableHead className="text-center text-sm font-semibold text-foreground">{activeLine?.product?.unit_2nd_name || "2nd"}</TableHead>
                    <TableHead className="text-center text-sm font-semibold text-foreground">{activeLine?.product?.unit_3rd_name || "3rd"}</TableHead>
                    <TableHead className="text-center text-sm font-semibold text-foreground">P.RATE</TableHead>
                    <TableHead className="text-center text-sm font-semibold text-foreground">UNIT</TableHead>
                    <TableHead className="text-center text-sm font-semibold text-foreground">DISC%</TableHead>
                    <TableHead className="text-right text-sm font-semibold text-foreground">AMOUNT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.id} className={cn(index === activeRow ? "bg-[#e2f0ea]" : undefined, "transition-colors")}>
                      <TableCell className="py-1.5 text-center text-sm font-semibold text-muted-foreground">
                        <span className={cn("inline-flex min-w-7 items-center justify-center rounded-sm px-1.5 py-1", index === activeRow ? "bg-[#2f5d50] text-white" : "bg-muted")}>
                          {index + 1}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5">
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
                            "h-9 w-full justify-start rounded-none px-0 text-left text-sm font-semibold",
                            index === activeRow && activeField === "product" ? "bg-[#2f5d50] px-2 text-white hover:bg-[#2f5d50]" : ""
                          )}
                          onClick={() => {
                            setActiveRow(index);
                            setActiveField("product");
                            setProductSearchOpen(true);
                          }}
                          onKeyDown={(e) => {
                            handleLineFieldKeyDown(e, index, "product");
                          }}
                        >
                          {line.product ? `${line.product.name}${line.product.brand ? ` • ${line.product.brand}` : ""}` : "Search product"}
                        </Button>
                      </TableCell>
                      <TableCell className="py-1.5"><Input ref={setLineRef(line.id, "quantity1")} value={line.quantity1} onFocus={() => { setActiveRow(index); setActiveField("quantity1"); }} onChange={(e) => updateLine(index, { quantity1: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity1")} className={cn("h-9 rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold", index === activeRow && activeField === "quantity1" ? "bg-[#2f5d50] text-white" : "")} /></TableCell>
                      <TableCell className="py-1.5"><Input ref={setLineRef(line.id, "quantity2")} value={line.quantity2} onFocus={() => { setActiveRow(index); setActiveField("quantity2"); }} onChange={(e) => updateLine(index, { quantity2: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity2")} className={cn("h-9 rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold", index === activeRow && activeField === "quantity2" ? "bg-[#2f5d50] text-white" : "")} /></TableCell>
                      <TableCell className="py-1.5"><Input ref={setLineRef(line.id, "quantity3")} value={line.quantity3} onFocus={() => { setActiveRow(index); setActiveField("quantity3"); }} onChange={(e) => updateLine(index, { quantity3: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity3")} className={cn("h-9 rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold", index === activeRow && activeField === "quantity3" ? "bg-[#2f5d50] text-white" : "")} /></TableCell>
                      <TableCell className="py-1.5"><Input ref={setLineRef(line.id, "rateValue")} value={line.rateValue} onFocus={() => { setActiveRow(index); setActiveField("rateValue"); }} onChange={(e) => updateLine(index, { rateValue: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "rateValue")} className={cn("h-9 rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold", index === activeRow && activeField === "rateValue" ? "bg-[#2f5d50] text-white" : "")} /></TableCell>
                      <TableCell className="py-1.5">
                        <select
                          ref={setLineRef(line.id, "rateUnitLevel")}
                          className={cn("h-9 w-full rounded-none border-0 bg-transparent px-2 text-center text-sm font-semibold", index === activeRow && activeField === "rateUnitLevel" ? "bg-[#2f5d50] text-white" : "")}
                          value={line.rateUnitLevel}
                          onFocus={() => { setActiveRow(index); setActiveField("rateUnitLevel"); }}
                          onChange={(e) => updateLine(index, { rateUnitLevel: Number(e.target.value) as 1 | 2 | 3 })}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "rateUnitLevel")}
                        >
                          <option value={1}>{line.product?.unit_1st_name || "1st"}</option>
                          <option value={2} disabled={!line.product?.unit_2nd_name}>{line.product?.unit_2nd_name || "2nd"}</option>
                          <option value={3} disabled={!line.product?.unit_3rd_name}>{line.product?.unit_3rd_name || "3rd"}</option>
                        </select>
                      </TableCell>
                      <TableCell className="py-1.5"><Input ref={setLineRef(line.id, "discountPercent")} value={line.discountPercent} onFocus={() => { setActiveRow(index); setActiveField("discountPercent"); }} onChange={(e) => updateLine(index, { discountPercent: e.target.value })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "discountPercent")} className={cn("h-9 rounded-none border-x-0 border-y-0 bg-transparent text-center text-base font-semibold", index === activeRow && activeField === "discountPercent" ? "bg-[#2f5d50] text-white" : "")} /></TableCell>
                      <TableCell className="py-1.5 text-right text-base font-semibold">{Number(line.amount || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="grid gap-px border-t bg-border md:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-px bg-border md:grid-cols-2">
                <div className="bg-background p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Selected Item</div>
                  {activeLine?.product ? (
                    <div className="mt-2 space-y-2">
                      <div className="text-base font-semibold">{activeLine.product.name}</div>
                      <div className="text-sm text-muted-foreground">{activeLine.product.brand || "-"}</div>
                      <div>Stock: <span className="font-semibold">{activeLine.product.stock_ratio}</span></div>
                      <div>MRP: <span className="font-semibold">{Number(activeLine.product.mrp).toFixed(2)}</span></div>
                      <div>SRATE: <span className="font-semibold">{Number(activeLine.product.latest_rate_value || 0).toFixed(2)}</span></div>
                    </div>
                  ) : (
                    <div className="mt-2 text-muted-foreground">Select product to view detail.</div>
                  )}
                </div>
                <div className="bg-background p-3 text-sm">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Recent Product Bills</div>
                  <div className="mt-2 space-y-2">
                    {activeLine?.product?.recent_bills.length ? activeLine.product.recent_bills.slice(0, 3).map((bill) => (
                      <div key={`${bill.bill_number}-${bill.bill_date}`} className="flex items-center justify-between border-b pb-1 text-xs">
                        <span>{bill.bill_number}</span>
                        <span>{formatDisplayDate(bill.bill_date)}</span>
                        <span>{Number(bill.line_total_amount).toFixed(2)}</span>
                      </div>
                    )) : <div className="text-muted-foreground">No recent bills.</div>}
                  </div>
                </div>
              </div>
              <div className="bg-background p-3 text-sm">
                <div className="grid grid-cols-2 gap-y-2">
                  <div>VALUE OF GOODS</div><div className="text-right font-semibold">{totals.valueOfGoods.toFixed(2)}</div>
                  <div>DISCOUNT</div><div className="text-right font-semibold">{totals.discount.toFixed(2)}</div>
                  <div>GST</div><div className="text-right font-semibold">{totals.gst.toFixed(2)}</div>
                  <div className="self-center">FREIGHT</div>
                  <div><Input className="h-9 rounded-none border-x-0 border-t-0 text-right font-semibold" value={freightAmount} onChange={(e) => setFreightAmount(e.target.value)} /></div>
                  <div className="pt-2 text-base font-semibold">FINAL BILL</div><div className="pt-2 text-right text-2xl font-bold">{totals.finalAmount.toFixed(2)}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={() => void saveBill()} disabled={saving}>{saving ? "Saving..." : "Save Bill"}</Button>
                  <Button variant="outline" onClick={() => void showLedger()} disabled={!vendorSummary}>Ledger</Button>
                  {activeLine?.product ? <Button variant="outline" onClick={() => void openProductEdit(activeLine.product!)}>Edit Product</Button> : null}
                </div>
                <div className="mt-4">
                  <Label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Narration</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-2 rounded-none border-x-0 border-t-0" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-px bg-border">
            <div className="bg-background p-4 text-sm">
              <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Party History</div>
              {vendorSummary ? (
                <div className="space-y-3">
                  <div>
                    <div className="text-base font-semibold">{vendorSummary.vendor_name}</div>
                    <div className="mt-1 text-muted-foreground">{vendorSummary.address_lines.join(", ")}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Annual</div><div className="text-right font-semibold">{Number(vendorSummary.annual_purchase_amount).toFixed(2)}</div>
                    <div>Month</div><div className="text-right font-semibold">{Number(vendorSummary.monthly_purchase_amount).toFixed(2)}</div>
                    <div>Balance</div><div className="text-right font-semibold">{Number(vendorSummary.balance).toFixed(2)} {vendorSummary.balance_side}</div>
                    <div>Last Purc</div><div className="text-right font-semibold">{vendorSummary.last_purchase_date ? formatDisplayDate(vendorSummary.last_purchase_date) : "-"}</div>
                    <div>Last Pay</div><div className="text-right font-semibold">{vendorSummary.last_payment_date ? formatDisplayDate(vendorSummary.last_payment_date) : "-"}</div>
                    <div>GSTIN</div><div className="text-right font-semibold">{vendorSummary.gstin || "-"}</div>
                    <div>Area / Route</div><div className="text-right font-semibold">{vendorSummary.area || "-"} / {vendorSummary.route || "-"}</div>
                  </div>
                  <div className="border-t pt-3">
                    <div className="mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Last 3 Bills</div>
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
                </div>
              ) : (
                <div className="text-muted-foreground">Select vendor to view history.</div>
              )}
            </div>
            <div className="bg-background p-4 text-sm">
              <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Product Context</div>
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
              <Button variant="ghost" size="sm" className="h-8 px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setVendorSearchOpen(false)}>Esc</Button>
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
              <Button variant="ghost" size="sm" className="h-8 px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setProductSearchOpen(false)}>Esc</Button>
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
                    selectProduct(productResults[productIndex]);
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
                    onClick={() => selectProduct(product)}
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
            <div className="space-y-1"><Label>Base Price</Label><Input value={productEditForm.base_price} onChange={(e) => setProductEditForm((prev) => ({ ...prev, base_price: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button onClick={() => void saveProductEdit()}>Save Product</Button></div>
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
