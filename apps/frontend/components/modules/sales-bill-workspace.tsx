"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { EntryDraftLeaveDialog, EntryDraftResumeDialog } from "@/components/modules/entry-draft-dialogs";
import { asArray, asObject, deleteBackend, fetchBackend, fetchBackendFresh, patchBackend, postBackend, putBackend } from "@/lib/backend-api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PurchaseEntrySkeleton } from "@/components/ui/purchase-entry-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type WarehouseOption = { id: string; name: string; code: string; state: string | null };
type LookupOption = { id: string; name: string };
type SubCategoryOption = LookupOption & { category_id?: string };
type AccountCategoryOption = { id: string; code: string; name: string };
type CustomerSummary = {
  customer_id: string;
  customer_name: string;
  address_lines: string[];
  brand_names: string[];
  sales_type: "LOCAL" | "CENTRAL" | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  owner_name: string | null;
  phone: string | null;
  area: string | null;
  route: string | null;
  annual_sales_amount: string;
  monthly_sales_amount: string;
  balance: string;
  balance_side: string;
  last_sale_date: string | null;
  last_receipt_date: string | null;
  last_bills: Array<{ bill_number: string; bill_date: string; total_amount: string }>;
  open_challans: Array<{ challan_id: string; reference_no: string; challan_date: string | null; item_count: number; customer_name?: string }>;
};

type ProductSummary = {
  product_id: string;
  sku: string;
  name: string;
  brand: string | null;
  /** Denormalized; used to match scheme scope with backend _matches_scope. */
  category: string | null;
  sub_category: string | null;
  description: string | null;
  hsn_code: string | null;
  tax_percent: string;
  mrp: string;
  /** Category / list selling price from sales product summary */
  selling_price: string;
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
  weight_in_grams: string | null;
  stock_base_quantity: string;
  stock_ratio: string;
  latest_rate_value: string | null;
  latest_rate_unit_level: number | null;
  latest_discount_percent: string | null;
  has_interactions: boolean;
  recent_bills: Array<{
    bill_number: string;
    bill_date: string;
    quantity: string;
    mrp: string;
    rate_value: string;
    discount_percent: string;
    line_total_amount: string;
    unit_name: string;
  }>;
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
  has_interactions: boolean;
};

type UnitOption = { id: string; unit_code: string; unit_name: string };
type HsnOption = { id: string; hsn_code: string; gst_percent: string };
type CustomerCreateForm = {
  firm_name: string;
  brand_ids: string[];
  sales_type: "LOCAL" | "CENTRAL";
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
  /** Set when line came from a sales order (invoice from challan) */
  salesOrderItemId?: string;
  /** Preview-only row for scheme free items; excluded from save payload (server adds free lines). */
  schemePreviewFree?: boolean;
  /** Label shown for scheme-sourced lines */
  schemeLineNote?: string;
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

type SalesEntrySchemeOption = {
  id: string;
  scheme_name: string;
  customer_category_name: string;
  condition_basis: string;
  threshold_value: string;
  threshold_unit: string;
  reward_type: string;
  reward_discount_percent: string | null;
  reward_product_id: string | null;
  reward_product_name: string | null;
  reward_product_quantity: string | null;
  brand: string | null;
  category: string | null;
  sub_category: string | null;
  product_id: string | null;
};

function mapSalesSchemeOption(row: Record<string, unknown>): SalesEntrySchemeOption {
  return {
    id: String(row.id ?? ""),
    scheme_name: String(row.scheme_name ?? ""),
    customer_category_name: String(row.customer_category_name ?? ""),
    condition_basis: String(row.condition_basis ?? ""),
    threshold_value: String(row.threshold_value ?? "0"),
    threshold_unit: String(row.threshold_unit ?? ""),
    reward_type: String(row.reward_type ?? ""),
    reward_discount_percent: row.reward_discount_percent != null ? String(row.reward_discount_percent) : null,
    reward_product_id: row.reward_product_id != null ? String(row.reward_product_id) : null,
    reward_product_name: row.reward_product_name != null ? String(row.reward_product_name) : null,
    reward_product_quantity: row.reward_product_quantity != null ? String(row.reward_product_quantity) : null,
    brand: row.brand != null ? String(row.brand) : null,
    category: row.category != null ? String(row.category) : null,
    sub_category: row.sub_category != null ? String(row.sub_category) : null,
    product_id: row.product_id != null ? String(row.product_id) : null,
  };
}

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
  has_interactions: false,
};
const EMPTY_CUSTOMER_FORM: CustomerCreateForm = {
  firm_name: "",
  brand_ids: [],
  sales_type: "CENTRAL",
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

function SchemesPopoverSkeleton() {
  const bar = (className: string) => <div className={cn("animate-pulse rounded bg-[#dde6dc]", className)} />;
  const card = (key: string) => (
    <div key={key} className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2">
      {bar("h-3 w-[72%]")}
      {bar("h-2.5 w-[48%]")}
      {bar("h-2 w-full")}
      {bar("mt-1 h-7 w-full rounded-md")}
    </div>
  );
  return (
    <div className="grid gap-0 md:grid-cols-2">
      <div className="border-r border-border p-3">
        {bar("mb-2 h-3 w-36")}
        <div className="space-y-2">
          {card("a")}
          {card("b")}
        </div>
      </div>
      <div className="p-3">
        {bar("mb-2 h-3 w-32")}
        <div className="space-y-2">{card("c")}</div>
      </div>
    </div>
  );
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

/** Whole-number display for quantity cells (avoids 5.0; normalizes API decimals). */
function displayWholeQty(stateValue: string): string {
  const s = (stateValue ?? "").trim();
  if (!s) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return sanitizeDigits(s);
  return String(Math.round(n));
}

/** Money / % fields: at most 2 decimal places (rounded). */
function roundMoney2(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).trim().replace(/,/g, "");
  if (!s) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return String(raw).trim();
  return n.toFixed(2);
}

/** DISC % / DISC AMT typing: max 2 fractional digits; rounds if user pastes extra precision; keeps trailing "." while editing. */
function sanitizeMoneyInput2dp(raw: string): string {
  const s = String(raw ?? "").trim().replace(/,/g, "").replace(/[^0-9.]/g, "");
  if (!s) return "";
  const firstDot = s.indexOf(".");
  if (firstDot === -1) return s;
  const intPart = s.slice(0, firstDot).replace(/\./g, "");
  const fracRaw = s.slice(firstDot + 1).replace(/\./g, "");
  if (fracRaw.length === 0 && s.endsWith(".")) {
    return (intPart || "0") + ".";
  }
  if (fracRaw.length <= 2) {
    return (intPart || "0") + "." + fracRaw;
  }
  const n = Number((intPart || "0") + "." + fracRaw);
  if (!Number.isFinite(n)) return s;
  return roundMoney2(n);
}

/** Beats Input defaults (text-base / md:text-sm, h-9, px-3) so grid numbers fit h-7 without clipping. */
const COMPACT_GRID_INPUT_BASE =
  "h-7 min-h-0 px-1.5 py-0 text-[10px] md:text-[10px] leading-tight font-semibold tabular-nums rounded-none border-x-0 border-y-0 bg-transparent text-[#111714] shadow-none";

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

/** Stable JSON snapshot for unsaved-change detection (sales challan / invoice draft). */
function serializeSalesEntryDraft(d: {
  billDate: string;
  billDateInput: string;
  dueDate: string;
  billNumber: string;
  receivedDate: string;
  receivedDateInput: string;
  paymentMode: string;
  warehouseId: string;
  freightAmount: string;
  taxType: string;
  entryNumber: string;
  customerId: string | null;
  lines: LineDraft[];
}) {
  const linePayload = d.lines.map((line, idx) => ({
    i: idx,
    pid: line.product?.product_id ?? "",
    soi: line.salesOrderItemId ?? "",
    q1: line.quantity1,
    q2: line.quantity2,
    q3: line.quantity3,
    mrp: line.mrp,
    rv: line.rateValue,
    rul: line.rateUnitLevel,
    dp: line.discountPercent,
    dl: line.discountLumpsum,
    amt: line.amount,
    spf: line.schemePreviewFree ? 1 : 0,
    sn: line.schemeLineNote ?? "",
  }));
  return JSON.stringify({
    billDate: d.billDate,
    billDateInput: d.billDateInput,
    dueDate: d.dueDate,
    billNumber: d.billNumber.trim(),
    receivedDate: d.receivedDate,
    receivedDateInput: d.receivedDateInput,
    paymentMode: d.paymentMode,
    warehouseId: d.warehouseId,
    freightAmount: d.freightAmount,
    taxType: d.taxType,
    entryNumber: d.entryNumber.trim(),
    customerId: d.customerId ?? "",
    lines: linePayload,
  });
}

/** Human-readable conversion factors for Selected Item panel (matches masters: conv_2_to_1 = 1st per 2nd, etc.). */
function formatConversionQty(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (Number.isInteger(n)) return String(n);
  const t = n.toFixed(6).replace(/\.?0+$/, "");
  return t || null;
}

function productUnitConversionLines(p: ProductSummary): string[] {
  const u1 = p.unit_1st_name?.trim() || "Primary";
  const u2 = p.unit_2nd_name?.trim();
  const u3 = p.unit_3rd_name?.trim();
  const c21 = formatConversionQty(p.conv_2_to_1);
  const c32 = formatConversionQty(p.conv_3_to_2);
  const c31 = formatConversionQty(p.conv_3_to_1);
  const lines: string[] = [];
  if (u2 && c21) {
    lines.push(`1 ${u2} = ${c21} ${u1}`);
  }
  if (u3 && u2 && c32) {
    lines.push(`1 ${u3} = ${c32} ${u2}`);
  }
  if (u3 && c31 && !(u2 && c32)) {
    lines.push(`1 ${u3} = ${c31} ${u1}`);
  }
  return lines;
}

type LineField =
  | "product"
  | "quantity1"
  | "quantity2"
  | "quantity3"
  | "rateValue"
  | "rateUnitLevel"
  | "discountPercent"
  | "discountLumpsum"
  | "taxable"
  | "lineAmount";
const LINE_FIELD_ORDER: LineField[] = [
  "product",
  "quantity3",
  "quantity2",
  "quantity1",
  "rateValue",
  "rateUnitLevel",
  "discountPercent",
  "discountLumpsum",
  "taxable",
  "lineAmount",
];
const PAYMENT_MODE_OPTIONS: Array<"CREDIT" | "CASH"> = ["CREDIT", "CASH"];
const CUSTOMER_CREATE_FIELD_ORDER = [
  "firm_name",
  "sales_type",
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
  return [
    "product",
    ...getLineQuantityFields(line),
    "rateValue",
    "rateUnitLevel",
    "discountPercent",
    "discountLumpsum",
    "taxable",
    "lineAmount",
  ];
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

function deriveTaxType(warehouseState?: string | null, customerState?: string | null) {
  return (warehouseState || "").trim().toUpperCase() === (customerState || "").trim().toUpperCase() ? "LOCAL" : "CENTRAL";
}

function deriveSalesTypeFromGstin(gstin: string) {
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
  const rate = asDecimal(
    line.rateValue || line.product.latest_rate_value || line.product.selling_price || line.product.cost_price || "0"
  );
  const conv2 = asDecimal(line.product.conv_2_to_1);
  const conv3 = asDecimal(line.product.conv_3_to_1);
  if (line.rateUnitLevel === 2 && conv2 > 0) return rate / conv2;
  if (line.rateUnitLevel === 3 && conv3 > 0) return rate / conv3;
  return rate;
}

/** Mirrors backend `services/schemes._matches_scope` (string category/sub_category on Product). */
function productMatchesSchemeScope(product: ProductSummary, scheme: SalesEntrySchemeOption): boolean {
  if (scheme.product_id && String(scheme.product_id) !== String(product.product_id)) {
    return false;
  }
  if (scheme.brand && (product.brand || "").trim() !== scheme.brand.trim()) {
    return false;
  }
  if (scheme.category && (product.category || "").trim() !== scheme.category.trim()) {
    return false;
  }
  if (scheme.sub_category && (product.sub_category || "").trim() !== scheme.sub_category.trim()) {
    return false;
  }
  return true;
}

function computeLineSchemeMetric(line: LineDraft, scheme: SalesEntrySchemeOption): number {
  if (!line.product || line.schemePreviewFree) return 0;
  if (!productMatchesSchemeScope(line.product, scheme)) return 0;
  const basis = (scheme.condition_basis || "QTY").toUpperCase();
  const baseQty = lineBaseQuantity(line);
  if (basis === "VALUE") {
    return baseQty * lineUnitPrice(line);
  }
  if (basis === "WEIGHT") {
    const w = asDecimal(line.product.weight_in_grams || "0");
    const grams = baseQty * w;
    if ((scheme.threshold_unit || "").toUpperCase() === "KG") {
      return grams / 1000;
    }
    return grams;
  }
  return baseQty;
}

function computeBillSchemeMetric(lines: LineDraft[], scheme: SalesEntrySchemeOption): number {
  return lines.reduce((sum, line) => sum + computeLineSchemeMetric(line, scheme), 0);
}

function schemeThresholdMet(lines: LineDraft[], scheme: SalesEntrySchemeOption): boolean {
  const threshold = asDecimal(scheme.threshold_value);
  if (threshold <= 0) {
    return true;
  }
  return computeBillSchemeMetric(lines, scheme) + 1e-9 >= threshold;
}

/** Human-readable gap when the bill has not yet reached the scheme threshold (same metric as server gating). */
function describeSchemeGap(lines: LineDraft[], scheme: SalesEntrySchemeOption): string {
  const threshold = asDecimal(scheme.threshold_value);
  if (threshold <= 0) {
    return "";
  }
  const total = computeBillSchemeMetric(lines, scheme);
  if (total + 1e-9 >= threshold) {
    return "";
  }
  const short = threshold - total;
  const basis = (scheme.condition_basis || "QTY").toUpperCase();
  const tu = (scheme.threshold_unit || "").trim();
  if (basis === "VALUE") {
    return `This bill contributes ${total.toFixed(2)} toward value; need ≥ ${threshold.toFixed(2)}. Short by ${short.toFixed(2)}.`;
  }
  if (basis === "WEIGHT") {
    const unitLbl = tu || "";
    return `This bill contributes ${total.toFixed(3)}${unitLbl ? ` ${unitLbl}` : ""}; need ≥ ${threshold.toFixed(3)}. Short by ${short.toFixed(3)}${unitLbl ? ` ${unitLbl}` : ""}.`;
  }
  return `This bill contributes ${total.toFixed(2)} in qualifying quantity; need ≥ ${threshold.toFixed(2)}. Short by ${short.toFixed(2)}.`;
}

/**
 * If the bill is below the scheme threshold, return a quantity patch for the target row so the
 * line alone can satisfy the shortfall (same idea as server apply_schemes_to_sales_order gating).
 */
function buildSchemeThresholdQtyPatch(
  lines: LineDraft[],
  scheme: SalesEntrySchemeOption,
  targetRowIndex: number,
): { ok: true; patch: Partial<LineDraft> } | { ok: false } {
  const threshold = asDecimal(scheme.threshold_value);
  if (threshold <= 0) {
    return { ok: true, patch: {} };
  }

  const target = lines[targetRowIndex];
  if (!target?.product) {
    toast.error("Select a product on this line before applying the scheme.");
    return { ok: false };
  }
  if (!productMatchesSchemeScope(target.product, scheme)) {
    toast.error("This product is not in scope for the selected scheme.");
    return { ok: false };
  }

  const totalMetric = computeBillSchemeMetric(lines, scheme);
  if (totalMetric + 1e-6 >= threshold) {
    return { ok: true, patch: {} };
  }

  const targetContrib = computeLineSchemeMetric(target, scheme);
  const otherMetric = totalMetric - targetContrib;
  const needFromTarget = threshold - otherMetric;

  const basis = (scheme.condition_basis || "QTY").toUpperCase();
  const curBase = lineBaseQuantity(target);
  const unitPrice = lineUnitPrice(target);

  let newBase = curBase;

  if (basis === "VALUE") {
    if (unitPrice <= 0) {
      toast.error("Set a selling rate on the line before applying this value-based scheme.");
      return { ok: false };
    }
    newBase = Math.max(curBase, Math.ceil(needFromTarget / unitPrice - 1e-9));
  } else if (basis === "WEIGHT") {
    const w = asDecimal(target.product.weight_in_grams || "0");
    if (w <= 0) {
      toast.error("Product weight is required for this weight-based scheme.");
      return { ok: false };
    }
    const isKg = (scheme.threshold_unit || "").toUpperCase() === "KG";
    const needGrams = isKg ? needFromTarget * 1000 : needFromTarget;
    newBase = Math.max(curBase, Math.ceil(needGrams / w - 1e-9));
  } else {
    newBase = Math.max(curBase, Math.ceil(needFromTarget - 1e-9));
  }

  if (newBase <= curBase) {
    return { ok: true, patch: {} };
  }

  const q1 = asDecimal(target.quantity1);
  const q2 = asDecimal(target.quantity2);
  const q3 = asDecimal(target.quantity3);
  const add = newBase - curBase;
  const nextQ1 = q1 + add;
  if (q2 !== 0 || q3 !== 0) {
    toast.info(
      `Adjusted base quantity on ${target.product.unit_1st_name || "1st unit"} to meet threshold. Verify 2nd/3rd units if needed.`,
    );
  }
  return { ok: true, patch: { quantity1: String(nextQ1) } };
}

function applyQuantityPatchToLineDraft(line: LineDraft, patch: Partial<LineDraft>): LineDraft {
  let next = { ...line, ...patch };
  if (next.product) {
    const baseQty = lineBaseQuantity(next);
    const subtotal = baseQty * lineUnitPrice(next);
    if ("discountPercent" in patch && !("discountLumpsum" in patch)) {
      const pct = asDecimal(patch.discountPercent);
      next.discountLumpsum = subtotal > 0 ? (subtotal * (pct / 100)).toFixed(2) : "0.00";
    } else if ("discountLumpsum" in patch && !("discountPercent" in patch)) {
      const amt = asDecimal(patch.discountLumpsum);
      next.discountPercent = subtotal > 0 ? ((amt / subtotal) * 100).toFixed(2) : "0.00";
    } else if (
      ("quantity1" in patch || "quantity2" in patch || "quantity3" in patch || "rateValue" in patch || "rateUnitLevel" in patch) &&
      subtotal > 0
    ) {
      const pct = asDecimal(next.discountPercent);
      next.discountLumpsum = (subtotal * (pct / 100)).toFixed(2);
    }
  }
  return { ...next, amount: computeLineAmount(next).toFixed(2) };
}

function computeLineAmount(line: LineDraft) {
  if (!line.product) return 0;
  const baseQty = lineBaseQuantity(line);
  const subtotal = baseQty * lineUnitPrice(line);
  const discountPercent = asDecimal(line.discountPercent || "0");
  const discountLumpsum = asDecimal(line.discountLumpsum);
  const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
  const taxable = subtotal - discountAmount;
  const tax = taxable * (asDecimal(line.product.tax_percent) / 100);
  return Math.max(0, taxable + tax);
}

function computeLineTaxableAmount(line: LineDraft) {
  if (!line.product) return 0;
  const baseQty = lineBaseQuantity(line);
  const subtotal = baseQty * lineUnitPrice(line);
  const discountPercent = asDecimal(line.discountPercent || "0");
  const discountLumpsum = asDecimal(line.discountLumpsum);
  const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
  return Math.max(0, subtotal - discountAmount);
}

function roundCurrency(value: number) {
  return Math.round(value);
}

function mapCustomerSummary(row: Record<string, unknown>): CustomerSummary {
  return {
    customer_id: String(row.customer_id ?? ""),
    customer_name: String(row.customer_name ?? ""),
    address_lines: Array.isArray(row.address_lines) ? row.address_lines.map((item) => String(item)) : [],
    brand_names: asArray(row.brand_names).map((item) => String(item)),
    sales_type: row.sales_type === "LOCAL" ? "LOCAL" : row.sales_type === "CENTRAL" ? "CENTRAL" : null,
    city: row.city ? String(row.city) : null,
    state: row.state ? String(row.state) : null,
    pincode: row.pincode ? String(row.pincode) : null,
    gstin: row.gstin ? String(row.gstin) : null,
    owner_name: row.owner_name ? String(row.owner_name) : null,
    phone: row.phone ? String(row.phone) : null,
    area: row.area ? String(row.area) : null,
    route: row.route ? String(row.route) : null,
    annual_sales_amount: String(row.annual_sales_amount ?? "0"),
    monthly_sales_amount: String(row.monthly_sales_amount ?? "0"),
    balance: String(row.balance ?? "0"),
    balance_side: String(row.balance_side ?? "CR"),
    last_sale_date: row.last_sale_date ? String(row.last_sale_date) : null,
  last_receipt_date: row.last_receipt_date ? String(row.last_receipt_date) : null,
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
      customer_name: challan.customer_name ? String(challan.customer_name) : undefined,
    })),
  };
}

function mapProductSummary(row: Record<string, unknown>): ProductSummary {
  return {
    product_id: String(row.product_id ?? ""),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    brand: row.brand ? String(row.brand) : null,
    category: row.category != null && row.category !== "" ? String(row.category) : null,
    sub_category: row.sub_category != null && row.sub_category !== "" ? String(row.sub_category) : null,
    description: row.description ? String(row.description) : null,
    hsn_code: row.hsn_code ? String(row.hsn_code) : null,
    tax_percent: String(row.tax_percent ?? "0"),
    mrp: String(row.mrp ?? "0"),
    selling_price: String(row.selling_price ?? row.cost_price ?? "0"),
    cost_price: String(row.cost_price ?? row.selling_price ?? "0"),
    unit_1st_name: row.unit_1st_name ? String(row.unit_1st_name) : null,
    unit_2nd_name: row.unit_2nd_name ? String(row.unit_2nd_name) : null,
    unit_3rd_name: row.unit_3rd_name ? String(row.unit_3rd_name) : null,
    unit_1st_id: row.unit_1st_id ? String(row.unit_1st_id) : null,
    unit_2nd_id: row.unit_2nd_id ? String(row.unit_2nd_id) : null,
    unit_3rd_id: row.unit_3rd_id ? String(row.unit_3rd_id) : null,
    conv_2_to_1: row.conv_2_to_1 ? String(row.conv_2_to_1) : null,
    conv_3_to_2: row.conv_3_to_2 ? String(row.conv_3_to_2) : null,
    conv_3_to_1: row.conv_3_to_1 ? String(row.conv_3_to_1) : null,
    weight_in_grams: row.weight_in_grams != null && row.weight_in_grams !== "" ? String(row.weight_in_grams) : null,
    stock_base_quantity: String(row.stock_base_quantity ?? "0"),
    stock_ratio: String(row.stock_ratio ?? "0 : 0 : 0"),
    latest_rate_value: row.latest_rate_value ? String(row.latest_rate_value) : null,
    latest_rate_unit_level: row.latest_rate_unit_level ? Number(row.latest_rate_unit_level) : null,
    latest_discount_percent: row.latest_discount_percent ? String(row.latest_discount_percent) : null,
    has_interactions: Boolean(row.has_interactions),
    recent_bills: asArray(row.recent_bills).map((bill) => ({
      bill_number: String(bill.bill_number ?? ""),
      bill_date: String(bill.bill_date ?? ""),
      quantity: String(bill.quantity ?? "0"),
      mrp: String(bill.mrp ?? "0"),
      rate_value: String(bill.rate_value ?? "0"),
      discount_percent: String(bill.discount_percent ?? "0"),
      line_total_amount: String(bill.line_total_amount ?? "0"),
      unit_name: String(bill.unit_name ?? ""),
    })),
  };
}

type SalesBillWorkspaceProps = {
  onSaved?: (detail?: { customerId: string; salesFinalInvoiceId?: string }) => void;
  onClose?: () => void;
  initialId?: string;
  sourceChallanId?: string;
  mode?: "bill" | "challan";
  /** When false, save is disabled (e.g. read-only sales permission). */
  canWriteSales?: boolean;
};

export function SalesBillWorkspace({
  onSaved,
  onClose,
  initialId,
  sourceChallanId,
  mode = "bill",
  canWriteSales = true,
}: SalesBillWorkspaceProps) {
  const [loading, setLoading] = useState(true);
  /** True until order/invoice + customer + line product summaries finish loading (edit / convert from challan). */
  const [initialDocLoading, setInitialDocLoading] = useState(() => Boolean(initialId || sourceChallanId));
  const [localSourceChallanId, setLocalSourceChallanId] = useState(sourceChallanId);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [warehouseState, setWarehouseState] = useState<string | null>(null);
  const [billDateInput, setBillDateInput] = useState(formatDisplayDate(todayIso()));
  const [billDate, setBillDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [billNumber, setBillNumber] = useState("");
  const [entryNumber, setEntryNumber] = useState("");
  const [receivedDateInput, setReceivedDateInput] = useState(formatDisplayDate(todayIso()));
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [paymentMode, setPaymentMode] = useState<"CREDIT" | "CASH">("CREDIT");
  const [paymentModeOpen, setPaymentModeOpen] = useState(false);
  const [paymentModeIndex, setPaymentModeIndex] = useState(0);
  const [warehousePickerOpen, setWarehousePickerOpen] = useState(false);
  const [warehouseIndex, setWarehouseIndex] = useState(0);
  const [taxType, setTaxType] = useState<"LOCAL" | "CENTRAL">("CENTRAL");
  const [freightAmount, setFreightAmount] = useState("0");
  const [customerSummary, setCustomerSummary] = useState<CustomerSummary | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [customerIndex, setCustomerIndex] = useState(0);
  const [generalOpenChallans, setGeneralOpenChallans] = useState<CustomerSummary["open_challans"]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSummary[]>([]);
  const [productIndex, setProductIndex] = useState(0);
  const [activeRow, setActiveRow] = useState(0);
  const [activeField, setActiveField] = useState<LineField>("product");
  const [lines, setLines] = useState<LineDraft[]>([makeLine()]);
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const [schemePopoverRow, setSchemePopoverRow] = useState<number | null>(null);
  const [schemePopoverOpen, setSchemePopoverOpen] = useState(false);
  const [schemeForProduct, setSchemeForProduct] = useState<SalesEntrySchemeOption[]>([]);
  const [schemePopoverLoading, setSchemePopoverLoading] = useState(false);
  /** Bumps on each schemes fetch so stale responses do not overwrite state or clear loading early. */
  const schemeLoadGenRef = useRef(0);
  /** Latest schemes popover opener — used from focusLineField when landing on discount fields. */
  const openSchemesPopoverForRowRef = useRef<(rowIndex: number, anchor?: "discountPercent" | "discountLumpsum") => void>(() => {});
  /** Discount field that opened the schemes popover (for focus return after apply / Escape). */
  const schemeDiscountAnchorFieldRef = useRef<"discountPercent" | "discountLumpsum">("discountPercent");
  /** After apply/Escape, refocus discount without reopening the schemes popover. */
  const schemeSkipPopoverOpenRef = useRef(false);
  /** Flat order: eligible Apply buttons then pending (matches keyboard ↓ through the list). */
  const schemeApplyBtnRefs = useRef<(HTMLButtonElement | null)[]>([]);
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
  const [customerCategoryOptions, setCustomerCategoryOptions] = useState<AccountCategoryOption[]>([]);
  const [customerCreateOpen, setCustomerCreateOpen] = useState(false);
  const [productCreateOpen, setProductCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<"" | "brand" | "category" | "subCategory" | "unit" | "hsn">("");
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickCode, setQuickCode] = useState("");
  const [quickDescription, setQuickDescription] = useState("");
  const [quickGst, setQuickGst] = useState("0");
  const [quickCategoryId, setQuickCategoryId] = useState("");
  const [customerCategoryCreateOpen, setCustomerCategoryCreateOpen] = useState(false);
  const [creatingCustomerCategory, setCreatingCustomerCategory] = useState(false);
  const [customerCategoryForm, setCustomerCategoryForm] = useState({ code: "", name: "", description: "" });
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [customerCreateForm, setCustomerCreateForm] = useState<CustomerCreateForm>({ ...EMPTY_CUSTOMER_FORM });
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
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);
  const productSearchRef = useRef<HTMLInputElement | null>(null);
  const productCellRef = useRef<HTMLButtonElement | null>(null);
  const customerButtonRef = useRef<HTMLButtonElement | null>(null);
  const customerCreateRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | null>>({});
  const productCreateRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({});
  const customerCreateSaveRef = useRef<HTMLButtonElement | null>(null);
  const productCreateSaveRef = useRef<HTMLButtonElement | null>(null);
  const lineRefs = useRef<Record<string, HTMLInputElement | HTMLButtonElement | null>>({});

  const activeLine = lines[activeRow] ?? null;

  const setLineRef = useCallback((rowId: string, field: LineField) => {
    return (node: HTMLInputElement | HTMLButtonElement | null) => {
      lineRefs.current[`${rowId}:${field}`] = node;
    };
  }, []);

  const setCustomerCreateRef = useCallback((field: string) => {
    return (node: HTMLInputElement | HTMLSelectElement | null) => {
      customerCreateRefs.current[field] = node;
    };
  }, []);

  const setProductCreateRef = useCallback((field: string) => {
    return (node: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
      productCreateRefs.current[field] = node;
    };
  }, []);

  const focusCustomerCreateField = useCallback((field: string) => {
    const node = customerCreateRefs.current[field];
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

  const handleCustomerCreateKeyDown = useCallback((event: ReactKeyboardEvent, field: (typeof CUSTOMER_CREATE_FIELD_ORDER)[number]) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const currentIndex = CUSTOMER_CREATE_FIELD_ORDER.indexOf(field);
    const nextField = CUSTOMER_CREATE_FIELD_ORDER[currentIndex + 1];
    if (nextField) {
      focusCustomerCreateField(nextField);
      return;
    }
    customerCreateSaveRef.current?.focus();
  }, [focusCustomerCreateField]);

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
    const row = linesRef.current[rowIndex];
    if (!row) {
      return;
    }
    setActiveRow(rowIndex);
    setActiveField(field);
    const key = `${row.id}:${field}`;
    const node = lineRefs.current[key];
    if (node && "focus" in node) {
      node.focus();
      if ("select" in node && typeof node.select === "function") {
        node.select();
      }
    }
    // Programmatic .focus() does not always run the input onFocus path the same way as a click;
    // open schemes when the grid lands on discount fields via keyboard navigation.
    if (field === "discountPercent" || field === "discountLumpsum") {
      queueMicrotask(() => {
        if (schemeSkipPopoverOpenRef.current) {
          schemeSkipPopoverOpenRef.current = false;
          return;
        }
        openSchemesPopoverForRowRef.current(rowIndex, field);
      });
    }
  }, []);

  const totals = useMemo(() => {
    const valueOfGoods = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || "0");
      const discountLumpsum = asDecimal(line.discountLumpsum);
      const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
      return sum + Math.max(0, subtotal - discountAmount);
    }, 0);
    const gst = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || "0");
      const discountLumpsum = asDecimal(line.discountLumpsum);
      const discountAmount = subtotal * (discountPercent / 100) + discountLumpsum;
      const taxable = Math.max(0, subtotal - discountAmount);
      return sum + taxable * (asDecimal(line.product.tax_percent) / 100);
    }, 0);
    const discount = lines.reduce((sum, line) => {
      if (!line.product) return sum;
      const baseQty = lineBaseQuantity(line);
      const subtotal = baseQty * lineUnitPrice(line);
      const discountPercent = asDecimal(line.discountPercent || "0");
      const discountLumpsum = asDecimal(line.discountLumpsum);
      return sum + subtotal * (discountPercent / 100) + discountLumpsum;
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
        fetchBackend("/sales/sales-entry/bootstrap"),
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
      toast.error(error instanceof Error ? error.message : "Failed to load sales entry");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCreateReferences = useCallback(async () => {
    try {
      const [brandRes, categoryRes, subCategoryRes, customerCategoryRes] = await Promise.all([
        fetchBackendFresh("/masters/product-brands?page=1&page_size=200"),
        fetchBackendFresh("/masters/product-categories?page=1&page_size=200"),
        fetchBackendFresh("/masters/product-sub-categories?page=1&page_size=200"),
        fetchBackendFresh("/masters/account-categories?party_type=CUSTOMER&page=1&page_size=200"),
      ]);
      setBrandOptions(asArray(asObject(brandRes).items).map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? "") })));
      setCategoryOptions(asArray(asObject(categoryRes).items).map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? "") })));
      setSubCategoryOptions(asArray(asObject(subCategoryRes).items).map((item) => ({ id: String(item.id ?? ""), name: String(item.name ?? ""), category_id: item.category_id ? String(item.category_id) : undefined })));
      setCustomerCategoryOptions(asArray(asObject(customerCategoryRes).items).map((item) => ({ id: String(item.id ?? ""), code: String(item.code ?? ""), name: String(item.name ?? "") })));
    } catch {
      setBrandOptions([]);
      setCategoryOptions([]);
      setSubCategoryOptions([]);
      setCustomerCategoryOptions([]);
    }
  }, []);

  const searchCustomers = useCallback(async (query: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const res = await fetchBackendFresh(`/sales/sales-entry/customers/search?${params.toString()}`);
    const items = asArray(asObject(res).items).map(mapCustomerSummary);
    setCustomerResults(items);
    setCustomerIndex(0);
  }, []);

  const searchProducts = useCallback(async (query: string) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    const res = await fetchBackendFresh(`/sales/sales-entry/products/search?${params.toString()}`);
    const items = asArray(asObject(res).items).map(mapProductSummary);
    setProductResults(items);
    setProductIndex(0);
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (!initialId && !localSourceChallanId) {
      setInitialDocLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setInitialDocLoading(true);
      try {
        const isConversion = Boolean(localSourceChallanId);
        const effectiveId = localSourceChallanId || initialId;
        const endpoint = mode === "challan" ? "/sales/sales-orders" : "/sales/sales-final-invoices";
        const fetchEndpoint = isConversion ? "/sales/sales-orders" : endpoint;

        const data = asObject(await fetchBackend(`${fetchEndpoint}/${effectiveId}`));
        
        if (!isConversion) {
          setBillNumber(String(data.invoice_number || data.reference_no || ""));
          setEntryNumber(String(data.entry_number || ""));
        }
        
        setBillDate(String(data.invoice_date || data.order_date || todayIso()));
        setBillDateInput(formatDisplayDate(String(data.invoice_date || data.order_date || todayIso())));
        const invOrOrderDate = String(data.invoice_date || data.order_date || todayIso());
        setDueDate(String(data.due_date || invOrOrderDate).slice(0, 10));
        setReceivedDate(String(data.delivery_date || todayIso()));
        setReceivedDateInput(formatDisplayDate(String(data.delivery_date || todayIso())));
        setPaymentMode(data.payment_mode === "CASH" ? "CASH" : "CREDIT");
        setWarehouseId(String(data.warehouse_id || ""));
        setFreightAmount(String(data.freight_amount || "0"));

        if (data.customer_id) {
          const v = asObject(await fetchBackend(`/masters/customers/${data.customer_id}`));
          setCustomerSummary(mapCustomerSummary(v));
        }

        const items = asArray(data.items);
        if (items.length > 0) {
          const mappedLines = await Promise.all(items.map(async (item) => {
            const row = asObject(item);
            const p = mapProductSummary(asObject(await fetchBackend(`/sales/sales-entry/products/${row.product_id}/summary`)));
            const line: LineDraft = {
              id: crypto.randomUUID(),
              salesOrderItemId: row.id ? String(row.id) : undefined,
              product: p,
              quantity1: displayWholeQty(String(row.quantity ?? row.quantity_1st ?? "")),
              quantity2: displayWholeQty(String(row.quantity_2nd ?? "")),
              quantity3: displayWholeQty(String(row.quantity_3rd ?? "")),
              mrp: roundMoney2(String(row.mrp ?? p.mrp ?? "0")),
              rateValue: roundMoney2(String(row.selling_price ?? row.rate_value ?? p.latest_rate_value ?? p.selling_price ?? "0")),
              rateUnitLevel: (Number(row.rate_unit_level) || 1) as 1 | 2 | 3,
              discountPercent: roundMoney2(String(row.discount_percent ?? "0")),
              discountLumpsum: roundMoney2(String(row.discount_lumpsum ?? "0")),
              amount: roundMoney2(String(row.line_total_amount ?? row.total_amount ?? "0")),
            };
            return line;
          }));
          setLines([...mappedLines, makeLine()]);
        }
      } catch (error) {
        toast.error("Failed to load initial data");
      } finally {
        if (!cancelled) {
          setInitialDocLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialId, localSourceChallanId, mode]);

  const draftSessionKey = useMemo(
    () => `${initialId ?? ""}|${localSourceChallanId ?? ""}|${mode}`,
    [initialId, localSourceChallanId, mode],
  );
  const entryDraftKind = useMemo(() => (mode === "challan" ? "sales_challan" : "sales_bill"), [mode]);
  const [baselineSnapshot, setBaselineSnapshot] = useState<string | null>(null);

  const currentDraftSnapshot = useMemo(
    () =>
      serializeSalesEntryDraft({
        billDate,
        billDateInput,
        dueDate,
        billNumber,
        receivedDate,
        receivedDateInput,
        paymentMode,
        warehouseId,
        freightAmount,
        taxType,
        entryNumber,
        customerId: customerSummary?.customer_id ?? null,
        lines,
      }),
    [
      billDate,
      billDateInput,
      dueDate,
      billNumber,
      receivedDate,
      receivedDateInput,
      paymentMode,
      warehouseId,
      freightAmount,
      taxType,
      entryNumber,
      customerSummary?.customer_id,
      lines,
    ],
  );

  const isDraftDirty =
    baselineSnapshot !== null &&
    currentDraftSnapshot !== baselineSnapshot &&
    canWriteSales;

  const draftBaselineReadyRef = useRef(false);
  const prevDraftSessionKeyRef = useRef(draftSessionKey);

  useEffect(() => {
    if (prevDraftSessionKeyRef.current !== draftSessionKey) {
      prevDraftSessionKeyRef.current = draftSessionKey;
      draftBaselineReadyRef.current = false;
    }
    const ready = !loading && !initialDocLoading;
    if (!ready) {
      draftBaselineReadyRef.current = false;
      return;
    }
    if (!draftBaselineReadyRef.current) {
      draftBaselineReadyRef.current = true;
      setBaselineSnapshot(currentDraftSnapshot);
    }
  }, [loading, initialDocLoading, draftSessionKey, currentDraftSnapshot]);

  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [savingLeaveDraft, setSavingLeaveDraft] = useState(false);
  const [resumeDialogOpen, setResumeDialogOpen] = useState(false);
  const [resumeDraftUpdatedAt, setResumeDraftUpdatedAt] = useState<string | null>(null);
  const [resumeDraftPayload, setResumeDraftPayload] = useState<Record<string, unknown> | null>(null);
  const draftSessionKeyRef = useRef(draftSessionKey);
  const resumePromptDoneRef = useRef(false);

  useEffect(() => {
    if (draftSessionKeyRef.current !== draftSessionKey) {
      draftSessionKeyRef.current = draftSessionKey;
      resumePromptDoneRef.current = false;
      setResumeDraftPayload(null);
      setResumeDraftUpdatedAt(null);
      setResumeDialogOpen(false);
    }
  }, [draftSessionKey]);

  const hydrateSalesDraft = useCallback(async (payload: Record<string, unknown>, whState: string | null) => {
    const bd = String(payload.billDate ?? todayIso());
    const bdi = String(payload.billDateInput ?? "");
    const dd = String(payload.dueDate ?? bd).slice(0, 10);
    const bn = String(payload.billNumber ?? "");
    const rd = String(payload.receivedDate ?? todayIso());
    const rdi = String(payload.receivedDateInput ?? "");
    const pm = payload.paymentMode === "CASH" ? "CASH" : "CREDIT";
    const wid = String(payload.warehouseId ?? "");
    const fa = String(payload.freightAmount ?? "0");
    const tt = payload.taxType === "LOCAL" ? "LOCAL" : "CENTRAL";
    const en = String(payload.entryNumber ?? "");
    const cid = String(payload.customerId ?? "").trim();

    const rawLines = asArray(payload.lines as unknown);
    const nextLines: LineDraft[] = [];
    for (const row of rawLines) {
      const o = asObject(row);
      const pid = String(o.pid ?? "").trim();
      if (!pid) {
        nextLines.push(makeLine());
        continue;
      }
      const p = mapProductSummary(asObject(await fetchBackend(`/sales/sales-entry/products/${pid}/summary`)));
      const soi = String(o.soi ?? "").trim();
      nextLines.push({
        id: crypto.randomUUID(),
        salesOrderItemId: soi || undefined,
        schemePreviewFree: Number(o.spf) === 1,
        schemeLineNote: String(o.sn ?? "").trim() || undefined,
        product: p,
        quantity1: displayWholeQty(String(o.q1 ?? "")),
        quantity2: displayWholeQty(String(o.q2 ?? "")),
        quantity3: displayWholeQty(String(o.q3 ?? "")),
        mrp: roundMoney2(String(o.mrp ?? "0")),
        rateValue: roundMoney2(String(o.rv ?? "0")),
        rateUnitLevel: (Number(o.rul) || 1) as 1 | 2 | 3,
        discountPercent: roundMoney2(String(o.dp ?? "0")),
        discountLumpsum: roundMoney2(String(o.dl ?? "0")),
        amount: roundMoney2(String(o.amt ?? "0")),
      });
    }
    if (!nextLines.some((l) => l.product === null)) {
      nextLines.push(makeLine());
    }

    let customer: CustomerSummary | null = null;
    if (cid) {
      customer = mapCustomerSummary(asObject(await fetchBackend(`/masters/customers/${cid}`)));
    }

    flushSync(() => {
      setBillDate(bd);
      setBillDateInput(bdi || formatDisplayDate(bd));
      setDueDate(dd);
      setBillNumber(bn);
      setReceivedDate(rd);
      setReceivedDateInput(rdi || formatDisplayDate(rd));
      setPaymentMode(pm);
      setWarehouseId(wid);
      setFreightAmount(fa);
      setEntryNumber(en);
      setCustomerSummary(customer);
      setTaxType(
        customer
          ? ((customer.sales_type || deriveTaxType(whState, customer.state)) as "LOCAL" | "CENTRAL")
          : tt,
      );
      setLines(nextLines);
    });

    const resolvedTax = customer
      ? ((customer.sales_type || deriveTaxType(whState, customer.state)) as "LOCAL" | "CENTRAL")
      : tt;
    const snap = serializeSalesEntryDraft({
      billDate: bd,
      billDateInput: bdi || formatDisplayDate(bd),
      dueDate: dd,
      billNumber: bn,
      receivedDate: rd,
      receivedDateInput: rdi || formatDisplayDate(rd),
      paymentMode: pm,
      warehouseId: wid,
      freightAmount: fa,
      taxType: resolvedTax,
      entryNumber: en,
      customerId: cid || null,
      lines: nextLines,
    });
    setBaselineSnapshot(snap);
  }, []);

  useEffect(() => {
    if (initialId || localSourceChallanId || !canWriteSales || loading || initialDocLoading) {
      return;
    }
    if (resumePromptDoneRef.current) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const raw = asObject(await fetchBackendFresh(`/entry-drafts/${entryDraftKind}`));
        if (cancelled) return;
        const p = raw.payload;
        if (p && typeof p === "object" && !Array.isArray(p)) {
          setResumeDraftPayload(p as Record<string, unknown>);
          setResumeDraftUpdatedAt(typeof raw.updated_at === "string" ? raw.updated_at : null);
          setResumeDialogOpen(true);
        }
      } catch {
        /* no draft */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialId, localSourceChallanId, canWriteSales, loading, initialDocLoading, entryDraftKind]);

  const requestClose = useCallback(() => {
    if (!onClose) {
      return;
    }
    if (isDraftDirty) {
      setLeaveDialogOpen(true);
      return;
    }
    onClose();
  }, [isDraftDirty, onClose]);

  const handleLeaveStay = useCallback(() => {
    setLeaveDialogOpen(false);
  }, []);

  const handleLeaveDiscard = useCallback(() => {
    setLeaveDialogOpen(false);
    void deleteBackend(`/entry-drafts/${entryDraftKind}`).catch(() => {});
    onClose?.();
  }, [entryDraftKind, onClose]);

  const handleLeaveSaveDraft = useCallback(async () => {
    if (!onClose) return;
    setSavingLeaveDraft(true);
    try {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(currentDraftSnapshot) as Record<string, unknown>;
      } catch {
        toast.error("Could not serialize draft");
        return;
      }
      await putBackend(`/entry-drafts/${entryDraftKind}`, { payload: parsed });
      toast.success("Draft saved");
      setLeaveDialogOpen(false);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save draft");
    } finally {
      setSavingLeaveDraft(false);
    }
  }, [currentDraftSnapshot, entryDraftKind, onClose]);

  const handleResumeStartFresh = useCallback(() => {
    resumePromptDoneRef.current = true;
    setResumeDialogOpen(false);
    setResumeDraftPayload(null);
    setResumeDraftUpdatedAt(null);
    void deleteBackend(`/entry-drafts/${entryDraftKind}`).catch(() => {});
  }, [entryDraftKind]);

  const handleResumeContinue = useCallback(async () => {
    if (!resumeDraftPayload) return;
    resumePromptDoneRef.current = true;
    const payload = resumeDraftPayload;
    const widStr = String(payload.warehouseId ?? warehouseId);
    const wh = warehouses.find((w) => w.id === widStr) ?? null;
    const whState = wh?.state ?? warehouseState ?? null;
    setResumeDialogOpen(false);
    setResumeDraftPayload(null);
    setResumeDraftUpdatedAt(null);
    try {
      await hydrateSalesDraft(payload, whState);
      toast.success("Draft loaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load draft");
    }
  }, [hydrateSalesDraft, resumeDraftPayload, warehouseId, warehouses, warehouseState]);

  useEffect(() => {
    if (!isDraftDirty) {
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDraftDirty]);

  useEffect(() => {
    if (!loading && !initialDocLoading) {
      billDateRef.current?.focus();
      billDateRef.current?.select();
    }
  }, [loading, initialDocLoading]);

  useEffect(() => {
    void loadCreateReferences();
  }, [loadCreateReferences]);

  useEffect(() => {
    async function fetchGeneralOpenChallans() {
      try {
        const raw = await fetchBackend("/sales/sales-orders?open_only=true");
        // Check if raw is the Paginated response or direct list
        const items = Array.isArray(raw) ? raw : (raw as any).items || [];
        setGeneralOpenChallans(asArray(items).map((order: any) => ({
          challan_id: String(order.id),
          reference_no: String(order.invoice_number),
          challan_date: order.created_at ? String(order.created_at).split("T")[0] : null,
          item_count: Number(order.item_count || 0),
          customer_name: String(order.customer_name || ""),
        })));
      } catch (err) {
        console.error("Failed to fetch general open sales orders", err);
      }
    }
    void fetchGeneralOpenChallans();
  }, []);

  useEffect(() => {
    if (!customerSearchOpen) return;
    void searchCustomers(customerSearch);
  }, [customerSearchOpen, customerSearch, searchCustomers]);

  useEffect(() => {
    if (!productSearchOpen) return;
    void searchProducts(productSearch);
  }, [productSearchOpen, productSearch, searchProducts]);

  useEffect(() => {
    setCustomerIndex((i) => Math.min(i, Math.max(0, customerResults.length - 1)));
  }, [customerResults]);

  useEffect(() => {
    setProductIndex((i) => Math.min(i, Math.max(0, productResults.length - 1)));
  }, [productResults]);

  useEffect(() => {
    const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? null;
    const nextWarehouseState = selectedWarehouse?.state ?? null;
    setWarehouseState(nextWarehouseState);
    if (customerSummary) {
      setTaxType((customerSummary.sales_type || deriveTaxType(nextWarehouseState, customerSummary.state)) as "LOCAL" | "CENTRAL");
    }
  }, [customerSummary, warehouseId, warehouses]);

  useEffect(() => {
    if (customerSearchOpen) {
      setTimeout(() => customerSearchRef.current?.focus(), 0);
    }
  }, [customerSearchOpen]);

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
    if (customerCreateOpen) {
      setTimeout(() => focusCustomerCreateField("firm_name"), 0);
    }
  }, [focusCustomerCreateField, customerCreateOpen]);

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
        setTimeout(() => focusLineField(productTargetRow, "product"), 0);
        return;
      }
      if (customerSearchOpen) {
        event.preventDefault();
        setCustomerSearchOpen(false);
        setTimeout(() => customerButtonRef.current?.focus(), 0);
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
      if (onClose) {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [customerSearchOpen, focusLineField, onClose, paymentModeOpen, productSearchOpen, productTargetRow, rateUnitPicker, requestClose, warehousePickerOpen]);

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

  const selectCustomer = useCallback((customer: CustomerSummary) => {
    setCustomerSummary(customer);
    setTaxType(((customer.sales_type || deriveTaxType(warehouseState, customer.state)) as "LOCAL" | "CENTRAL") || "CENTRAL");
    setCustomerSearchOpen(false);
    setCustomerSearch("");
    setTimeout(() => paymentModeRef.current?.focus(), 0);
  }, [warehouseState]);

  const updateLine = useCallback((index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, idx) => {
      if (idx !== index) return line;
      let next = { ...line, ...patch };
      
      // Bi-directional discount calculation
      if (next.product) {
        const baseQty = lineBaseQuantity(next);
        const subtotal = baseQty * lineUnitPrice(next);
        
        if ("discountPercent" in patch && !("discountLumpsum" in patch)) {
          const pct = asDecimal(patch.discountPercent);
          next.discountLumpsum = subtotal > 0 ? (subtotal * (pct / 100)).toFixed(2) : "0.00";
        } else if ("discountLumpsum" in patch && !("discountPercent" in patch)) {
          const amt = asDecimal(patch.discountLumpsum);
          next.discountPercent = subtotal > 0 ? ((amt / subtotal) * 100).toFixed(2) : "0.00";
        } else if (("quantity1" in patch || "quantity2" in patch || "quantity3" in patch || "rateValue" in patch || "rateUnitLevel" in patch) && subtotal > 0) {
          // If subtotal changes, keep percent and update lumpsum
          const pct = asDecimal(next.discountPercent);
          next.discountLumpsum = (subtotal * (pct / 100)).toFixed(2);
        }
      }

      return { ...next, amount: computeLineAmount(next).toFixed(2) };
    }));
  }, []);

  const deleteLine = useCallback((rowIndex: number) => {
    setLines((prev) => {
      const line = prev[rowIndex];
      if (!line || !line.product) return prev; // Don't delete empty rows
      if (prev.filter((l) => l.product !== null).length === 0) return prev; // Keep at least one
      const next = prev.filter((_, idx) => idx !== rowIndex);
      // Ensure there's always a trailing empty line
      if (next.every((l) => l.product !== null)) {
        next.push(makeLine());
      }
      return next;
    });
    // Move focus to previous row or stay at same index
    const newIndex = Math.max(0, rowIndex - 1);
    setActiveRow(newIndex);
    setTimeout(() => focusLineField(newIndex, "product"), 80);
  }, [focusLineField]);

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

  const selectProduct = useCallback(
    async (product: ProductSummary, targetRow = productTargetRow) => {
      const docLabel = mode === "challan" ? "challan" : "bill";
      const existingIdx = linesRef.current.findIndex((line) => line.product?.product_id === product.product_id);
      if (existingIdx !== -1) {
        const line = linesRef.current[existingIdx];
        const q = Math.max(0, Math.round(Number(line.quantity1 || "0") || 0));
        updateLine(existingIdx, { quantity1: String(q + 1) });
        toast.info(`This product is already on this ${docLabel}. Quantity increased.`);
        setProductSearchOpen(false);
        setProductSearch("");
        ensureTrailingEmptyLine();
        setActiveRow(existingIdx);
        const firstField = getLineQuantityFields(line)[0] ?? "quantity1";
        setActiveField(firstField);
        setTimeout(() => focusLineField(existingIdx, firstField), 0);
        return;
      }

      let rateValue = product.latest_rate_value || product.selling_price || "0";
      if (customerSummary?.customer_id) {
        try {
          const rp = asObject(
            await fetchBackend(
              `/sales/sales-entry/products/${product.product_id}/resolved-price?customer_id=${customerSummary.customer_id}`
            )
          );
          if (rp.unit_price != null) {
            rateValue = String(rp.unit_price);
          }
        } catch {
          /* keep summary defaults */
        }
      }
    updateLine(targetRow, {
      product,
      mrp: product.mrp ? roundMoney2(product.mrp) : "0.00",
      rateValue: roundMoney2(rateValue),
      rateUnitLevel: (product.latest_rate_unit_level as 1 | 2 | 3 | null) ?? 1,
      discountPercent: "0.00",
    });
    setProductSearchOpen(false);
    setProductSearch("");
    ensureTrailingEmptyLine();
    setActiveRow(targetRow);
    setActiveField(getLineQuantityFields({ ...makeLine(), product })[0] ?? "quantity1");
    setTimeout(() => focusLineField(targetRow, getLineQuantityFields({ ...makeLine(), product })[0] ?? "quantity1"), 0);
    },
    [customerSummary?.customer_id, ensureTrailingEmptyLine, focusLineField, mode, productTargetRow, updateLine]
  );

  const openProductSelector = useCallback((rowIndex = activeRow) => {
    if (!customerSummary?.customer_id) {
      toast.error("Select customer first");
      return;
    }
    setProductTargetRow(rowIndex);
    setProductSearchOpen(true);
  }, [activeRow, customerSummary?.customer_id]);

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
    const full = mapProductSummary(asObject(await fetchBackend(`/sales/sales-entry/products/${product.product_id}/summary`)));
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
      weight_in_grams: full.weight_in_grams || "",
      tax_percent: full.tax_percent,
      has_interactions: full.has_interactions,
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
      const refreshed = mapProductSummary(asObject(await fetchBackend(`/sales/sales-entry/products/${activeLine.product.product_id}/summary`)));
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

  async function createInlineCustomerCategory() {
    if (!customerCategoryForm.code.trim() || !customerCategoryForm.name.trim()) {
      toast.error("Category code and name are required");
      return;
    }
    setCreatingCustomerCategory(true);
    try {
      const created = asObject(await postBackend("/masters/account-categories", {
        code: customerCategoryForm.code.trim(),
        name: customerCategoryForm.name.trim(),
        party_type: "CUSTOMER",
        description: customerCategoryForm.description.trim() || null,
        is_active: true,
      }));
      await loadCreateReferences();
      setCustomerCreateForm((prev) => ({ ...prev, account_category_id: String(created.id ?? "") }));
      setCustomerCategoryForm({ code: "", name: "", description: "" });
      setCustomerCategoryCreateOpen(false);
      toast.success("Account category created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create account category");
    } finally {
      setCreatingCustomerCategory(false);
    }
  }

  const showLedger = useCallback(async () => {
    if (!customerSummary) return;
    try {
      const res = asObject(await fetchBackend(`/sales/sales-entry/customers/${customerSummary.customer_id}/ledger`));
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
  }, [customerSummary]);

  const loadSchemesForRow = useCallback(
    async (rowIndex: number) => {
      const line = linesRef.current[rowIndex];
      if (!line?.product || !customerSummary || line.schemePreviewFree) {
        return;
      }
      const loadId = ++schemeLoadGenRef.current;
      setSchemePopoverLoading(true);
      try {
        const params = new URLSearchParams({
          product_id: line.product.product_id,
          customer_id: customerSummary.customer_id,
          as_of_date: billDate,
        });
        const res = asObject(await fetchBackend(`/sales/sales-entry/schemes/available?${params.toString()}`));
        if (loadId !== schemeLoadGenRef.current) return;
        setSchemeForProduct(asArray(res.for_product).map((item) => mapSalesSchemeOption(asObject(item))));
      } catch {
        if (loadId !== schemeLoadGenRef.current) return;
        toast.error("Could not load schemes");
        setSchemeForProduct([]);
      } finally {
        if (loadId === schemeLoadGenRef.current) {
          setSchemePopoverLoading(false);
        }
      }
    },
    [customerSummary, billDate],
  );

  const onDiscountSchemesFocus = useCallback(
    (rowIndex: number, anchorField: "discountPercent" | "discountLumpsum" = "discountPercent") => {
      if (schemeSkipPopoverOpenRef.current) {
        return;
      }
      if (!canWriteSales) {
        return;
      }
      const line = linesRef.current[rowIndex];
      if (!line?.product || !customerSummary || line.schemePreviewFree) {
        return;
      }
      schemeDiscountAnchorFieldRef.current = anchorField;
      setSchemePopoverRow(rowIndex);
      setSchemePopoverOpen(true);
      void loadSchemesForRow(rowIndex);
    },
    [canWriteSales, customerSummary, loadSchemesForRow],
  );
  openSchemesPopoverForRowRef.current = (rowIndex, anchor) => {
    onDiscountSchemesFocus(rowIndex, anchor ?? "discountPercent");
  };

  const schemeEligibilitySplit = useMemo(() => {
    const eligible: SalesEntrySchemeOption[] = [];
    const pending: SalesEntrySchemeOption[] = [];
    for (const s of schemeForProduct) {
      if (schemeThresholdMet(lines, s)) {
        eligible.push(s);
      } else {
        pending.push(s);
      }
    }
    return { eligible, pending };
  }, [schemeForProduct, lines]);

  const schemeApplyChain = useMemo(
    () => [...schemeEligibilitySplit.eligible, ...schemeEligibilitySplit.pending],
    [schemeEligibilitySplit],
  );

  useEffect(() => {
    if (activeField !== "discountPercent" && activeField !== "discountLumpsum") {
      setSchemePopoverOpen(false);
      setSchemePopoverRow(null);
    }
  }, [activeField]);

  const applySchemeToLine = useCallback(
    async (scheme: SalesEntrySchemeOption, targetRowIndex: number) => {
      const thresholdResult = buildSchemeThresholdQtyPatch(linesRef.current, scheme, targetRowIndex);
      if (!thresholdResult.ok) {
        return;
      }
      const qtyPatch = thresholdResult.patch;
      const returnFocus = () => {
        const anchor = schemeDiscountAnchorFieldRef.current;
        setSchemePopoverOpen(false);
        setSchemePopoverRow(null);
        queueMicrotask(() => {
          schemeSkipPopoverOpenRef.current = true;
          focusLineField(targetRowIndex, anchor);
        });
      };

      if (scheme.reward_type === "DISCOUNT" && scheme.reward_discount_percent) {
        updateLine(targetRowIndex, { ...qtyPatch, discountPercent: roundMoney2(String(scheme.reward_discount_percent)) });
        const extra =
          Object.keys(qtyPatch).length > 0
            ? ` Quantity updated to meet threshold (${scheme.condition_basis} ≥ ${scheme.threshold_value}${scheme.threshold_unit ? ` ${scheme.threshold_unit}` : ""}).`
            : "";
        toast.success(`Applied “${scheme.scheme_name}”: ${scheme.reward_discount_percent}% discount.${extra}`);
        returnFocus();
        return;
      }
      if (scheme.reward_type === "FREE_ITEM" && scheme.reward_product_id && scheme.reward_product_quantity) {
        try {
          const raw = asObject(await fetchBackend(`/sales/sales-entry/products/${scheme.reward_product_id}/summary`));
          const p = mapProductSummary(raw);
          const qty = scheme.reward_product_quantity;
          const freeLine: LineDraft = {
            ...makeLine(),
            product: p,
            schemePreviewFree: true,
            schemeLineNote: scheme.scheme_name,
            quantity1: displayWholeQty(String(qty)),
            quantity2: "",
            quantity3: "",
            mrp: p.mrp ? roundMoney2(p.mrp) : "0.00",
            rateValue: "0",
            rateUnitLevel: 1,
            discountPercent: "100",
            discountLumpsum: "0",
            amount: "0.00",
          };
          freeLine.amount = computeLineAmount(freeLine).toFixed(2);
          setLines((prev) => {
            const withQty = prev.map((line, idx) => {
              if (idx !== targetRowIndex) return line;
              if (Object.keys(qtyPatch).length === 0) return line;
              return applyQuantityPatchToLineDraft(line, qtyPatch);
            });
            const core = withQty.filter((l) => !l.schemePreviewFree);
            const lastEmpty = core.length > 0 && core[core.length - 1].product === null;
            const withoutTrailing = lastEmpty ? core.slice(0, -1) : core;
            return [...withoutTrailing, freeLine, makeLine()];
          });
          toast.success(
            `Added preview row for free item from “${scheme.scheme_name}”.` +
              (Object.keys(qtyPatch).length > 0
                ? ` Main line quantity set to meet threshold (${scheme.condition_basis} ≥ ${scheme.threshold_value}).`
                : ""),
          );
          returnFocus();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not load free product");
        }
      }
    },
    [focusLineField, updateLine],
  );

  const closeSchemePopoverReturnToDiscount = useCallback(
    (rowIndex: number) => {
      schemeSkipPopoverOpenRef.current = true;
      const anchor = schemeDiscountAnchorFieldRef.current;
      setSchemePopoverOpen(false);
      setSchemePopoverRow(null);
      queueMicrotask(() => {
        focusLineField(rowIndex, anchor);
      });
    },
    [focusLineField],
  );

  const handleSchemeApplyButtonKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, rowIndex: number, applyIdx: number, total: number) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (applyIdx < total - 1) {
          queueMicrotask(() => schemeApplyBtnRefs.current[applyIdx + 1]?.focus());
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (applyIdx > 0) {
          queueMicrotask(() => schemeApplyBtnRefs.current[applyIdx - 1]?.focus());
        } else {
          closeSchemePopoverReturnToDiscount(rowIndex);
        }
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSchemePopoverReturnToDiscount(rowIndex);
      }
    },
    [closeSchemePopoverReturnToDiscount],
  );

  const saveEntry = useCallback(async () => {
    if (!canWriteSales) {
      toast.error("You do not have permission to save sales entries.");
      return;
    }
    if (!customerSummary) {
      toast.error("Select customer");
      return;
    }
    const validLines = lines.filter((line) => line.product && lineBaseQuantity(line) > 0 && !line.schemePreviewFree);
    if (!validLines.length) {
      toast.error("Add at least one product line");
      return;
    }
    const convertChallanToBill = Boolean(localSourceChallanId) && mode === "bill" && !initialId;
    if (convertChallanToBill) {
      const missing = validLines.filter((l) => !l.salesOrderItemId);
      if (missing.length) {
        toast.error("Each line must be linked to the sales order. Re-open this invoice from the challan list.");
        return;
      }
    }
    const proceed = window.confirm(
      `Save sales ${mode === "challan" ? "order" : "invoice"} ${billNumber.trim() || "(auto)"} for ${customerSummary.customer_name}?`
    );
    if (!proceed) return;
    setSaving(true);
    try {
      const invNo = billNumber.trim() || null;
      const orderItems = validLines.map((line) => ({
        product_id: line.product!.product_id,
        quantity: lineBaseQuantity(line),
      }));

      let newInvoiceReceiptDetail: { customerId: string; salesFinalInvoiceId: string } | undefined;

      if (mode === "challan") {
        const body = {
        warehouse_id: warehouseId,
          customer_id: customerSummary.customer_id,
          source: "ADMIN",
          invoice_number: invNo,
          items: orderItems,
        };
        if (initialId) {
          await patchBackend(`/sales/sales-orders/${initialId}`, body);
          toast.success("Sales order updated");
        } else {
          await postBackend("/sales/sales-orders", body);
          toast.success("Sales order saved");
        }
      } else if (initialId) {
        await postBackend(`/sales/sales-final-invoices/${initialId}/edit`, {
          subtotal: totals.valueOfGoods,
          gst_amount: totals.gst,
          total_amount: totals.finalAmount,
          due_date: dueDate,
          reason: "Sales workspace edit",
          auto_note: true,
        });
        toast.success("Sales invoice updated");
      } else if (convertChallanToBill) {
        const created = asObject(
          await postBackend("/sales/sales-final-invoices/from-sales-order", {
            sales_order_id: localSourceChallanId,
            invoice_number: invNo,
            invoice_date: billDate,
            due_date: dueDate,
            items: validLines.map((line) => ({
              sales_order_item_id: line.salesOrderItemId!,
              quantity: lineBaseQuantity(line),
            })),
          }),
        );
        toast.success("Sales invoice saved");
        newInvoiceReceiptDetail = {
          customerId: customerSummary.customer_id,
          salesFinalInvoiceId: String(created.id ?? ""),
        };
      } else {
        const created = asObject(
          await postBackend("/sales/sales-final-invoices/direct", {
            customer_id: customerSummary.customer_id,
            warehouse_id: warehouseId,
            invoice_number: invNo,
            invoice_date: billDate,
            due_date: dueDate,
            items: orderItems,
          }),
        );
        toast.success("Sales invoice saved");
        newInvoiceReceiptDetail = {
          customerId: customerSummary.customer_id,
          salesFinalInvoiceId: String(created.id ?? ""),
        };
      }

      void deleteBackend(`/entry-drafts/${entryDraftKind}`).catch(() => {});

      if (onSaved) {
        onSaved(newInvoiceReceiptDetail);
        return;
      }
      await showLedger();
      setLines([makeLine()]);
      setFreightAmount("0");
      setActiveRow(0);
      void loadBootstrap();
      setTimeout(() => productCellRef.current?.focus(), 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to save ${mode}`);
    } finally {
      setSaving(false);
    }
  }, [
    canWriteSales,
    customerSummary,
    lines,
    billNumber,
    mode,
    warehouseId,
    billDate,
    dueDate,
    initialId,
    localSourceChallanId,
    entryDraftKind,
    onSaved,
    showLedger,
    loadBootstrap,
    totals.finalAmount,
    totals.gst,
    totals.valueOfGoods,
  ]);

  const moveGridFocus = useCallback((rowIndex: number, field: LineField) => {
    setActiveRow(rowIndex);
    const resolvedField = resolveFieldForLine(lines[rowIndex] ?? null, field);
    setActiveField(resolvedField);
    setTimeout(() => focusLineField(rowIndex, resolvedField), 0);
  }, [focusLineField, lines]);

  const navigateGridByDelta = useCallback((rowIndex: number, field: LineField, rowDelta: number, colDelta: number) => {
    const currentOrder = getLineFieldOrder(lines[rowIndex] ?? null);
    const currentCol = Math.max(0, currentOrder.indexOf(resolveFieldForLine(lines[rowIndex] ?? null, field)));
    
    if (colDelta !== 0) {
      const nextCol = currentCol + colDelta;
      if (nextCol < 0 && rowIndex === 0) {
        setTimeout(() => warehouseButtonRef.current?.focus(), 0);
        return;
      }
      const boundedNextCol = Math.max(0, Math.min(currentOrder.length - 1, nextCol));
      moveGridFocus(rowIndex, currentOrder[boundedNextCol]);
      return;
    }

    const nextRow = rowIndex + rowDelta;
    if (nextRow < 0) {
      setTimeout(() => warehouseButtonRef.current?.focus(), 0);
      return;
    }
    if (nextRow >= lines.length) {
      focusFooterField("freight");
      return;
    }
    moveGridFocus(nextRow, field);
  }, [lines, moveGridFocus]);

  const focusFooterField = useCallback((field: "freight" | "save") => {
    setTimeout(() => {
      if (field === "freight") {
        freightRef.current?.focus();
        freightRef.current?.select();
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
      if (productSearchOpen) {
        if (productResults.length) {
          const idx = Math.min(productIndex, productResults.length - 1);
          const p = productResults[idx];
          if (p) void selectProduct(p, productTargetRow);
        }
        return;
      }
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
      moveGridFocus(rowIndex, "taxable");
        return;
      }
    if (field === "taxable") {
      moveGridFocus(rowIndex, "lineAmount");
      return;
    }
    if (field === "lineAmount") {
      const nextRow = rowIndex + 1;
      if (nextRow >= lines.length) {
        setLines((prev) => (nextRow >= prev.length ? [...prev, makeLine()] : prev));
      }
      setActiveRow(nextRow);
      setActiveField("product");
      setTimeout(() => focusLineField(nextRow, "product"), 0);
      return;
    }
  }, [
    focusLineField,
    lines,
    moveGridFocus,
    openProductSelector,
    productIndex,
    productResults,
    productSearchOpen,
    productTargetRow,
    selectProduct,
  ]);

  const applyBillDateFromPicker = useCallback((iso: string) => {
    if (!iso) return;
    setBillDate(iso);
    setBillDateInput(formatDisplayDate(iso));
    setTimeout(() => setCustomerSearchOpen(true), 0);
  }, []);

  const applyReceivedDateFromPicker = useCallback((iso: string) => {
    if (!iso) return;
    setReceivedDate(iso);
    setReceivedDateInput(formatDisplayDate(iso));
    setTimeout(() => paymentModeRef.current?.focus(), 0);
  }, []);

  const handleLineFieldKeyDown = useCallback((event: ReactKeyboardEvent, rowIndex: number, field: LineField) => {
    if (!canWriteSales) return;
    if (event.key === "Enter") {
      handleLineFieldEnter(event, rowIndex, field);
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      deleteLine(rowIndex);
      return;
    }
    if (event.key === "F8") {
      event.preventDefault();
      deleteLine(rowIndex);
      return;
    }
    if (event.key === "ArrowRight") {
      const el = event.currentTarget as HTMLInputElement;
      if (el && typeof el.selectionEnd === "number") {
        if (el.selectionEnd !== null && el.selectionEnd < (el.value?.length || 0)) return;
      }
      event.preventDefault();
      navigateGridByDelta(rowIndex, field, 0, 1);
      return;
    }
    if (event.key === "ArrowLeft") {
      const el = event.currentTarget as HTMLInputElement;
      if (el && typeof el.selectionStart === "number") {
        if (el.selectionStart !== null && el.selectionStart > 0) return;
      }
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
      if (
        (field === "discountPercent" || field === "discountLumpsum") &&
        schemePopoverOpen &&
        schemePopoverRow === rowIndex &&
        !schemePopoverLoading &&
        schemeApplyChain.length > 0
      ) {
        event.preventDefault();
        queueMicrotask(() => schemeApplyBtnRefs.current[0]?.focus());
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
  }, [
    canWriteSales,
    handleLineFieldEnter,
    lines,
    navigateGridByDelta,
    schemeApplyChain.length,
    schemePopoverLoading,
    schemePopoverOpen,
    schemePopoverRow,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!canWriteSales) return;
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
  }, [activeLine, canWriteSales, openProductEdit, saveEntry]);

  if (loading || initialDocLoading) {
    return <PurchaseEntrySkeleton />;
  }

  const viewOnly = !canWriteSales;
  const viewReadOnlyInput =
    "read-only:cursor-default read-only:opacity-100 read-only:text-[#111714] read-only:bg-[#eef1ea]";
  const viewReadOnlyLineInput =
    "read-only:cursor-default read-only:opacity-100 read-only:text-[#111714] read-only:bg-transparent";
  const viewOnlyButtonClass = viewOnly ? "pointer-events-none cursor-default opacity-100" : "";

  const handleTopFieldKeyDown = (
    e: React.KeyboardEvent<HTMLElement>,
    currentIndex: number,
    isInput: boolean,
    onNavigateAway?: (next: () => void) => void
  ) => {
    if (!canWriteSales) return;
    let nextIndex = currentIndex;
    
    if (e.key === "Enter" && isInput) {
      nextIndex = currentIndex + 1;
    } else if (e.key === "ArrowRight") {
       if (isInput) {
         const el = e.currentTarget as HTMLInputElement;
         if (el.selectionEnd !== null && el.selectionEnd < el.value.length) return;
       }
       nextIndex = currentIndex + 1;
    } else if (e.key === "ArrowLeft") {
       if (isInput) {
         const el = e.currentTarget as HTMLInputElement;
         if (el.selectionStart !== null && el.selectionStart > 0) return;
       }
       nextIndex = currentIndex - 1;
    } else if (e.key === "ArrowDown") {
       if (!isInput) return;
       nextIndex = currentIndex + 1;
    } else if (e.key === "ArrowUp") {
       nextIndex = currentIndex - 1;
    } else {
       return;
    }
    
    if (nextIndex >= 0 && nextIndex !== currentIndex) {
      e.preventDefault();
      const fields = [
        billDateRef,
        customerButtonRef,
        paymentModeRef,
        billNumberRef,
        receivedDateRef,
        warehouseButtonRef
      ];
      
      const proceedToNext = () => {
        if (nextIndex < fields.length) {
          setTimeout(() => fields[nextIndex].current?.focus(), 0);
        } else if (nextIndex >= fields.length) {
          if (e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown") {
            const lastFilledRow = lines.findLastIndex((line) => line.product !== null);
            const targetRow = lastFilledRow >= 0 ? lastFilledRow : 0;
            setTimeout(() => focusLineField(targetRow, "product"), 0);
          }
        }
      };

      if (onNavigateAway) {
        onNavigateAway(proceedToNext);
      } else {
        proceedToNext();
      }
    }
  };

  const salesDocLabel = mode === "challan" ? "sales challan" : "sales invoice";
  const resumeUpdatedLabel =
    resumeDraftUpdatedAt && !Number.isNaN(Date.parse(resumeDraftUpdatedAt))
      ? new Date(resumeDraftUpdatedAt).toLocaleString()
      : "";

  return (
    <div className="bg-[#eef3ec] font-mono text-[#111714]">
      <EntryDraftLeaveDialog
        open={leaveDialogOpen}
        title="Leave this entry?"
        description={`You have unsaved changes on this ${salesDocLabel}. Save a draft to continue later, discard your edits, or stay.`}
        saving={savingLeaveDraft}
        onStay={handleLeaveStay}
        onDiscard={handleLeaveDiscard}
        onSaveDraft={() => void handleLeaveSaveDraft()}
      />
      <EntryDraftResumeDialog
        open={resumeDialogOpen}
        documentLabel={salesDocLabel}
        updatedAtLabel={resumeUpdatedLabel}
        onResume={() => void handleResumeContinue()}
        onStartFresh={handleResumeStartFresh}
      />
      <div className="relative overflow-hidden border border-[#59786f] bg-[#fbfcf7] shadow-[0_0_0_1px_rgba(89,120,111,0.24)]">
        <div className="flex items-center justify-between border-b border-[#59786f] bg-[#6f9186] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.32em] text-white">
          <span className="flex items-center gap-2">
            Sales {mode === "challan" ? "Challan" : "Invoice"} Console
            {!canWriteSales ? <span className="rounded border border-white/40 px-2 py-0.5 text-[10px] font-normal normal-case tracking-normal">View</span> : null}
          </span>
          {onClose ? (
            <Button type="button" variant="ghost" size="sm" className="h-6 text-white hover:bg-white/20 hover:text-white" onClick={requestClose}>
              Close
            </Button>
          ) : null}
        </div>
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_minmax(380px,26vw)]">
          <div className="min-w-0 border-r border-[#cad5cb]">
            {customerSummary ? (
              <div className="border-b border-[#cad5cb] bg-gradient-to-br from-[#e8f4ef] via-[#fbfcf7] to-[#f4f9f1] px-4 py-4">
                <h2 className="text-[1.5rem] font-bold leading-snug tracking-tight text-[#1a3329] md:text-[1.75rem]">
                  {customerSummary.customer_name}
                </h2>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-[#c5d9cc]/80 pt-3 text-sm text-[#111714]">
                  <span className="inline-flex min-w-0 shrink-0 items-baseline">
                    <span className="mr-1.5 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">Owner</span>
                    <span className="font-semibold">{customerSummary.owner_name?.trim() || "—"}</span>
                  </span>
                  <span className="inline-flex min-w-0 shrink-0 items-baseline">
                    <span className="mr-1.5 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">Phone</span>
                    <span className="font-semibold">{customerSummary.phone?.trim() || "—"}</span>
                  </span>
                  <span className="inline-flex min-w-0 flex-1 basis-0 items-baseline">
                    <span className="mr-1.5 shrink-0 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">Address</span>
                    <span className="min-w-0 font-semibold leading-snug">
                      {customerSummary.address_lines.filter(Boolean).join(", ") || "—"}
                    </span>
                  </span>
                  <span className="inline-flex min-w-0 max-w-full items-baseline">
                    <span className="mr-1.5 shrink-0 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">Brands</span>
                    <span className="min-w-0 font-semibold">
                      {customerSummary.brand_names.length ? customerSummary.brand_names.join(", ") : "None linked"}
                    </span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2 border-t border-[#c5d9cc]/80 pt-3 text-sm">
                  <span>
                    <span className="mr-1.5 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">GSTIN</span>
                    <span className="font-semibold text-[#111714]">{customerSummary.gstin || "—"}</span>
                  </span>
                  <span>
                    <span className="mr-1.5 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">Type</span>
                    <span className="font-semibold text-[#111714]">{taxType}</span>
                  </span>
                  <span>
                    <span className="mr-1.5 text-[11px] font-normal uppercase tracking-[0.16em] text-[#5b7368]">Mode</span>
                    <span className="font-semibold text-[#111714]">{paymentMode}</span>
                  </span>
                </div>
              </div>
            ) : null}

            <div className="grid gap-px bg-border md:grid-cols-12">
              <div className="bg-[#fbfcf7] p-1.5 md:col-span-3">
                <Label htmlFor="invoiceDate" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">
                  {mode === "challan" ? "Challan Date" : "Invoice Date"}
                </Label>
                <div className="mt-1 flex gap-1">
                  <Input
                    id="invoiceDate"
                    name="invoiceDate"
                    ref={billDateRef}
                    value={billDateInput}
                    readOnly={viewOnly}
                    onChange={(e) => setBillDateInput(e.target.value)}
                    onFocus={() => setActiveField("product")}
                    onKeyDown={(e) => {
                      if (viewOnly) return;
                      handleTopFieldKeyDown(e, 0, true, (next) => {
                        void confirmDate(billDateInput, setBillDate, setBillDateInput, next);
                      });
                    }}
                    placeholder="ddmmyyyy"
                    className={cn(
                      "h-7 min-w-0 flex-1 rounded-sm border-0 bg-[#eef1ea] text-xs font-semibold tracking-[0.2em] shadow-none",
                      viewReadOnlyInput,
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Open calendar"
                    tabIndex={viewOnly ? -1 : 0}
                    className={cn(
                      "h-7 shrink-0 rounded-sm border border-transparent bg-[#eef1ea] px-1.5 text-[10px] font-semibold shadow-none",
                      viewOnlyButtonClass,
                    )}
                    onClick={() => {
                      if (viewOnly) return;
                      const node = billDatePickerRef.current;
                      if (!node) return;
                      if (typeof node.showPicker === "function") {
                        node.showPicker();
                      } else {
                        node.click();
                      }
                    }}
                  >
                    Date
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
              <div className="bg-[#fbfcf7] p-1.5 md:col-span-5">
                <Label htmlFor="customerSelect" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">Party</Label>
                <Button
                  id="customerSelect"
                  name="customerSelect"
                  ref={customerButtonRef}
                  type="button"
                  variant="ghost"
                  tabIndex={viewOnly ? -1 : 0}
                  className={cn(
                    "mt-1 h-7 w-full justify-start rounded-sm border border-transparent bg-[#eef1ea] px-2 text-left text-xs font-semibold text-[#111714] shadow-none",
                    viewOnlyButtonClass,
                  )}
                  onClick={() => {
                    if (viewOnly) return;
                    setCustomerSearchOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (viewOnly) return;
                    if (customerSearchOpen && e.key === "Enter") {
                      e.preventDefault();
                      if (customerResults.length) {
                        const idx = Math.min(customerIndex, customerResults.length - 1);
                        selectCustomer(customerResults[idx]);
                      }
                      return;
                    }
                    handleTopFieldKeyDown(e, 1, false);
                    if (!e.defaultPrevented && (e.key === "Enter" || e.key === "ArrowDown")) {
                      e.preventDefault();
                      setCustomerSearchOpen(true);
                    }
                  }}
                >
                  {customerSummary ? customerSummary.customer_name : "Select customer"}
                </Button>
              </div>
              <div className="bg-[#fbfcf7] p-1.5 md:col-span-2">
                <Label htmlFor="paymentModeSelect" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">Mode</Label>
                <Button
                  id="paymentModeSelect"
                  name="paymentModeSelect"
                  ref={paymentModeRef}
                  type="button"
                  variant="ghost"
                  tabIndex={viewOnly ? -1 : 0}
                  className={cn(
                    "mt-1 h-7 w-full justify-start rounded-sm border border-transparent bg-[#eef1ea] px-2 text-left text-xs font-semibold text-[#111714] shadow-none",
                    viewOnlyButtonClass,
                  )}
                  onClick={() => {
                    if (viewOnly) return;
                    openPaymentModePicker();
                  }}
                  onKeyDown={(e) => {
                    if (viewOnly) return;
                    handleTopFieldKeyDown(e, 2, false);
                    if (!e.defaultPrevented && (e.key === "Enter" || e.key === "ArrowDown")) {
                      e.preventDefault();
                      openPaymentModePicker();
                    }
                  }}
                >
                  {paymentMode}
                </Button>
              </div>
              <div className="bg-[#fbfcf7] p-1.5 md:col-span-2">
                <Label htmlFor="billNumber" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">Bill No</Label>
                  <Input
                  id="billNumber"
                  name="billNumber"
                  ref={billNumberRef}
                  placeholder="AUTO-GENERATED"
                  value={billNumber}
                  readOnly={viewOnly}
                  onChange={(e) => setBillNumber(e.target.value)}
                  onKeyDown={(e) => {
                    if (viewOnly) return;
                    handleTopFieldKeyDown(e, 3, true);
                  }}
                  className={cn("mt-1 h-7 rounded-sm border-0 bg-[#eef1ea] text-xs font-semibold text-[#111714] shadow-none placeholder:text-muted-foreground/50", viewReadOnlyInput)}
                />
              </div>
            </div>

            {mode === "bill" ? (
              <div className="grid gap-px border-t bg-border md:grid-cols-12">
                <div className="bg-[#fbfcf7] p-1.5 md:col-span-4">
                  <Label htmlFor="dueDate" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">
                    Due date (credit)
                  </Label>
                  <Input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    value={dueDate}
                    readOnly={viewOnly}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={cn(
                      "mt-1 h-7 rounded-sm border-0 bg-[#eef1ea] text-xs font-semibold text-[#111714] shadow-none",
                      viewReadOnlyInput,
                    )}
                  />
                </div>
              </div>
            ) : null}

            <div className="grid gap-px border-t bg-border md:grid-cols-12">
              <div className="bg-[#fbfcf7] p-1 md:col-span-4">
                <Label htmlFor="deliveryDate" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">Delivery Date</Label>
                <div className="mt-1 flex gap-1">
                  <Input
                    id="deliveryDate"
                    name="deliveryDate"
                    ref={receivedDateRef}
                    value={receivedDateInput}
                    readOnly={viewOnly}
                    onChange={(e) => setReceivedDateInput(e.target.value)}
                    onFocus={() => setActiveField("product")}
                    onKeyDown={(e) => {
                      if (viewOnly) return;
                      handleTopFieldKeyDown(e, 4, true, (next) => {
                        void confirmDate(receivedDateInput, setReceivedDate, setReceivedDateInput, next);
                      });
                    }}
                    placeholder="ddmmyyyy"
                    className={cn(
                      "h-8 min-w-0 flex-1 rounded-sm border-0 bg-[#eef1ea] text-xs font-semibold tracking-[0.12em] shadow-none",
                      viewReadOnlyInput,
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="Open calendar"
                    tabIndex={viewOnly ? -1 : 0}
                    className={cn(
                      "h-8 shrink-0 rounded-sm border border-transparent bg-[#eef1ea] px-1.5 text-[10px] font-semibold shadow-none",
                      viewOnlyButtonClass,
                    )}
                    onClick={() => {
                      if (viewOnly) return;
                      const node = receivedDatePickerRef.current;
                      if (!node) return;
                      if (typeof node.showPicker === "function") {
                        node.showPicker();
                      } else {
                        node.click();
                      }
                    }}
                  >
                    Date
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
              <div className="bg-[#fbfcf7] p-1 md:col-span-4">
                <Label htmlFor="entryNumberDisplay" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">
                  Entry No
                </Label>
                <div
                  id="entryNumberDisplay"
                  className="mt-1 flex h-8 items-center rounded-sm bg-[#eef1ea] px-2 text-xs font-semibold text-[#111714]"
                >
                  {entryNumber || "—"}
                </div>
              </div>
              <div className="bg-[#fbfcf7] p-1 md:col-span-4">
                <Label htmlFor="warehouseSelect" className="text-[10px] uppercase tracking-[0.24em] text-[#6a746e]">Warehouse</Label>
                <Button
                  id="warehouseSelect"
                  name="warehouseSelect"
                  ref={warehouseButtonRef}
                  type="button"
                  variant="ghost"
                  tabIndex={viewOnly ? -1 : 0}
                  className={cn(
                    "mt-1 h-8 w-full justify-start rounded-sm border border-transparent bg-[#eef1ea] px-2 text-left text-xs font-semibold text-[#111714] shadow-none",
                    viewOnlyButtonClass,
                  )}
                  onClick={() => {
                    if (viewOnly) return;
                    openWarehousePicker();
                  }}
                  onKeyDown={(e) => {
                    if (viewOnly) return;
                    handleTopFieldKeyDown(e, 5, false);
                    if (!e.defaultPrevented && (e.key === "Enter" || e.key === "ArrowDown")) {
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
              <Table className="min-w-[800px] table-fixed">
                <TableHeader>
                  <TableRow className="bg-[#e7f0cb] hover:bg-[#e7f0cb]">
                    <TableHead className="w-[30px] text-center text-[10px] font-semibold text-foreground">#</TableHead>
                    <TableHead className="text-[10px] font-semibold text-foreground">PRODUCT</TableHead>
                    <TableHead className="w-[60px] text-center text-[10px] font-semibold text-foreground">{activeLine?.product?.unit_3rd_name || "3rd"}</TableHead>
                    <TableHead className="w-[60px] text-center text-[10px] font-semibold text-foreground">{activeLine?.product?.unit_2nd_name || "2nd"}</TableHead>
                    <TableHead className="w-[60px] text-center text-[10px] font-semibold text-foreground">{activeLine?.product?.unit_1st_name || "1st"}</TableHead>
                    <TableHead className="w-[65px] text-center text-[10px] font-semibold text-foreground">RATE</TableHead>
                    <TableHead className="w-[55px] text-center text-[10px] font-semibold text-foreground">UNIT</TableHead>
                    <TableHead className="w-[55px] text-center text-[10px] font-semibold text-foreground">DISC%</TableHead>
                    <TableHead className="w-[75px] text-center text-[10px] font-semibold text-foreground">DISC AMT</TableHead>
                    <TableHead className="w-[90px] text-right text-[10px] font-semibold text-foreground">TAXABLE</TableHead>
                    <TableHead className="w-[90px] text-right text-[10px] font-semibold text-foreground">AMOUNT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, index) => (
                    <TableRow key={line.id} className={cn(index === activeRow ? "bg-[#dfede5]" : "bg-[#fbfcf7]", "transition-colors group/row")}>
                      <TableCell className="py-0.5 text-center text-[10px] font-semibold text-muted-foreground">
                        {line.product ? (
                          <span className="relative inline-flex min-w-7 items-center justify-center">
                            <span
                              className={cn(
                                "inline-flex min-w-7 items-center justify-center rounded-sm px-1.5 py-1",
                                !viewOnly && "group-hover/row:invisible",
                                index === activeRow ? "bg-[#2f5d50] text-white" : "bg-[#eef1ea]",
                              )}
                            >
                              {index + 1}
                            </span>
                            {!viewOnly ? (
                              <button
                                type="button"
                                className="absolute inset-0 hidden items-center justify-center rounded-sm bg-red-100 text-red-600 hover:bg-red-200 group-hover/row:flex"
                                tabIndex={-1}
                                onClick={() => deleteLine(index)}
                                title="Delete line (F8)"
                              >
                                ✕
                              </button>
                            ) : null}
                          </span>
                        ) : (
                        <span className={cn("inline-flex min-w-7 items-center justify-center rounded-sm px-1.5 py-1", index === activeRow ? "bg-[#2f5d50] text-white" : "bg-[#eef1ea]")}>
                          {index + 1}
                        </span>
                        )}
                      </TableCell>
                      <TableCell className="py-1.5 overflow-hidden">
                        <Button
                          id={`line-${index}-product`}
                          name={`line-${index}-product`}
                          aria-label="Product"
                          ref={(node) => {
                            setLineRef(line.id, "product")(node);
                            if (index === activeRow) {
                              productCellRef.current = node;
                            }
                          }}
                          type="button"
                          variant="ghost"
                          tabIndex={viewOnly ? -1 : 0}
                          className={cn(
                            "h-7 w-full justify-start rounded-none border-0 bg-transparent px-2 text-left text-xs font-semibold text-[#111714] shadow-none",
                            viewOnly && "pointer-events-none cursor-default opacity-100",
                            index === activeRow && activeField === "product" ? "bg-[#2f5d50] text-white hover:bg-[#2f5d50]" : "",
                          )}
                          onFocus={() => {
                            if (viewOnly) return;
                            setActiveRow(index);
                            setActiveField("product");
                          }}
                          onClick={() => {
                            if (viewOnly) return;
                            setActiveRow(index);
                            setActiveField("product");
                            openProductSelector(index);
                          }}
                          onKeyDown={(e) => {
                            handleLineFieldKeyDown(e, index, "product");
                          }}
                        >
                          {line.product ? (
                            <span className="block w-full truncate">
                              <span className="block truncate">{line.product.name}{line.product.brand ? ` • ${line.product.brand}` : ""}</span>
                              {line.schemeLineNote ? (
                                <span className="block truncate text-[10px] font-normal text-[#5b655f]">Scheme: {line.schemeLineNote}</span>
                              ) : null}
                            </span>
                          ) : (
                            "Search product"
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="w-[75px] py-0.5"><Input id={`line-${index}-quantity3`} name={`line-${index}-quantity3`} aria-label="Quantity 3" ref={setLineRef(line.id, "quantity3")} inputMode="numeric" value={displayWholeQty(line.quantity3)} readOnly={viewOnly && !!line.product?.unit_3rd_name} disabled={!line.product?.unit_3rd_name} onFocus={() => { setActiveRow(index); setActiveField("quantity3"); }} onChange={(e) => updateLine(index, { quantity3: sanitizeDigits(e.target.value) })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity3")} className={cn(COMPACT_GRID_INPUT_BASE, "text-center disabled:opacity-20", viewReadOnlyLineInput, index === activeRow && activeField === "quantity3" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[75px] py-0.5"><Input id={`line-${index}-quantity2`} name={`line-${index}-quantity2`} aria-label="Quantity 2" ref={setLineRef(line.id, "quantity2")} inputMode="numeric" value={displayWholeQty(line.quantity2)} readOnly={viewOnly && !!line.product?.unit_2nd_name} disabled={!line.product?.unit_2nd_name} onFocus={() => { setActiveRow(index); setActiveField("quantity2"); }} onChange={(e) => updateLine(index, { quantity2: sanitizeDigits(e.target.value) })} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity2")} className={cn(COMPACT_GRID_INPUT_BASE, "text-center disabled:opacity-20", viewReadOnlyLineInput, index === activeRow && activeField === "quantity2" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[75px] py-0.5">
                        <Input
                          id={`line-${index}-quantity1`}
                          name={`line-${index}-quantity1`}
                          aria-label="Quantity 1"
                          ref={setLineRef(line.id, "quantity1")}
                          inputMode="numeric"
                          value={displayWholeQty(line.quantity1)}
                          readOnly={viewOnly}
                          onFocus={() => {
                            setActiveRow(index);
                            setActiveField("quantity1");
                          }}
                          onChange={(e) => updateLine(index, { quantity1: sanitizeDigits(e.target.value) })}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "quantity1")}
                          className={cn(
                            COMPACT_GRID_INPUT_BASE,
                            "text-center",
                            viewReadOnlyLineInput,
                            index === activeRow && activeField === "quantity1" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : ""
                          )}
                        />
                      </TableCell>
                      <TableCell className="w-[65px] py-0.5"><Input id={`line-${index}-rateValue`} name={`line-${index}-rateValue`} aria-label="Rate" ref={setLineRef(line.id, "rateValue")} value={line.rateValue} readOnly={viewOnly} onFocus={() => { setActiveRow(index); setActiveField("rateValue"); }} onChange={(e) => updateLine(index, { rateValue: e.target.value })} onBlur={(e) => { const r = roundMoney2(e.target.value); if (r !== line.rateValue) updateLine(index, { rateValue: r }); }} onKeyDown={(e) => handleLineFieldKeyDown(e, index, "rateValue")} className={cn(COMPACT_GRID_INPUT_BASE, "text-center", viewReadOnlyLineInput, index === activeRow && activeField === "rateValue" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : "")} /></TableCell>
                      <TableCell className="w-[55px] py-0.5">
                        <Button
                          id={`line-${index}-rateUnitLevel`}
                          name={`line-${index}-rateUnitLevel`}
                          aria-label="Rate Unit"
                          ref={setLineRef(line.id, "rateUnitLevel")}
                          type="button"
                          variant="ghost"
                          tabIndex={viewOnly ? -1 : 0}
                          className={cn(
                            "h-7 w-full justify-center rounded-none border-0 bg-transparent px-2 text-center text-[10px] font-semibold text-[#111714] shadow-none",
                            viewOnly && "pointer-events-none cursor-default opacity-100",
                            index === activeRow && activeField === "rateUnitLevel" ? "bg-[#2f5d50] text-white hover:bg-[#2f5d50]" : "",
                          )}
                          onFocus={() => { setActiveRow(index); setActiveField("rateUnitLevel"); }}
                          onClick={() => {
                            if (viewOnly) return;
                            setRateUnitPicker({ rowIndex: index, optionIndex: Math.max(0, line.rateUnitLevel - 1) });
                          }}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "rateUnitLevel")}
                        >
                          {line.rateUnitLevel === 3 ? (line.product?.unit_3rd_name || "3rd") : line.rateUnitLevel === 2 ? (line.product?.unit_2nd_name || "2nd") : (line.product?.unit_1st_name || "1st")}
                        </Button>
                      </TableCell>
                      <TableCell className="w-[55px] py-0.5">
                        <Popover
                          open={schemePopoverOpen && schemePopoverRow === index}
                          onOpenChange={(o) => {
                            setSchemePopoverOpen(o);
                            if (!o) {
                              setSchemePopoverRow(null);
                            }
                          }}
                        >
                          <PopoverAnchor asChild>
                            <Input
                              id={`line-${index}-discountPercent`}
                              name={`line-${index}-discountPercent`}
                              aria-label="Discount %"
                              ref={setLineRef(line.id, "discountPercent")}
                              value={line.discountPercent}
                              readOnly={viewOnly}
                              onFocus={() => {
                                setActiveRow(index);
                                setActiveField("discountPercent");
                                onDiscountSchemesFocus(index, "discountPercent");
                              }}
                              onChange={(e) => updateLine(index, { discountPercent: sanitizeMoneyInput2dp(e.target.value) })}
                              onBlur={(e) => {
                                const r = roundMoney2(e.target.value);
                                if (r !== line.discountPercent) updateLine(index, { discountPercent: r });
                              }}
                              onKeyDown={(e) => handleLineFieldKeyDown(e, index, "discountPercent")}
                              className={cn(
                                COMPACT_GRID_INPUT_BASE,
                                "text-center",
                                viewReadOnlyLineInput,
                                index === activeRow && activeField === "discountPercent" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : ""
                              )}
                            />
                          </PopoverAnchor>
                          <PopoverContent
                            className="w-[min(92vw,520px)] max-h-[min(70vh,440px)] overflow-y-auto p-0"
                            align="start"
                            side="bottom"
                            sideOffset={6}
                            onOpenAutoFocus={(e) => e.preventDefault()}
                            onEscapeKeyDown={(e) => {
                              e.preventDefault();
                              closeSchemePopoverReturnToDiscount(index);
                            }}
                          >
                            <div className="border-b bg-[#eef1ea] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#5b655f]">
                              Schemes for this product (bill date {formatDisplayDate(billDate)})
                            </div>
                            {schemePopoverLoading ? (
                              <SchemesPopoverSkeleton />
                            ) : (
                              <div className="grid gap-0 md:grid-cols-2">
                                <div className="border-r border-border p-3">
                                  <div className="mb-2 text-[11px] font-semibold text-[#2f5d50]">Eligible now</div>
                                  <p className="mb-2 text-[10px] text-muted-foreground">
                                    Threshold is met for this bill (quantities / value / weight on matching lines).
                                  </p>
                                  {schemeForProduct.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No schemes scoped to this product.</p>
                                  ) : schemeEligibilitySplit.eligible.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">None yet — adjust quantities or add matching lines.</p>
                                  ) : (
                                    <ul className="space-y-2">
                                      {schemeEligibilitySplit.eligible.map((s, eligIdx) => {
                                        const applyIdx = eligIdx;
                                        const totalApply = schemeApplyChain.length;
                                        return (
                                        <li key={s.id} className="rounded-md border bg-card p-2 text-xs">
                                          <div className="font-semibold leading-tight">{s.scheme_name}</div>
                                          <div className="mt-0.5 text-[10px] text-muted-foreground">{s.customer_category_name}</div>
                                          <div className="mt-1 text-[10px] text-[#5b655f]">
                                            Threshold: {s.condition_basis} ≥ {s.threshold_value} {s.threshold_unit}
                                          </div>
                                          <div className="mt-1 font-medium">
                                            {s.reward_type === "DISCOUNT"
                                              ? `${s.reward_discount_percent ?? "0"}% discount`
                                              : `Free: ${s.reward_product_name ?? "item"} × ${s.reward_product_quantity ?? ""}`}
                                          </div>
                                          <Button
                                            asChild
                                            size="sm"
                                            className="mt-2 h-7 w-full border-0 bg-[#111714] text-xs font-semibold text-white hover:bg-[#111714]/90"
                                            disabled={!canWriteSales}
                                          >
                                            <button
                                              type="button"
                                              ref={(el) => {
                                                schemeApplyBtnRefs.current[applyIdx] = el;
                                              }}
                                              onKeyDown={(e) => handleSchemeApplyButtonKeyDown(e, index, applyIdx, totalApply)}
                                              onClick={() => void applySchemeToLine(s, index)}
                                            >
                                              Apply
                                            </button>
                                          </Button>
                                        </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                                <div className="p-3">
                                  <div className="mb-2 text-[11px] font-semibold text-[#5b655f]">Not yet eligible</div>
                                  <p className="mb-2 text-[10px] text-muted-foreground">
                                    These schemes apply to this product if you satisfy the condition on the bill.
                                  </p>
                                  {schemeForProduct.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">—</p>
                                  ) : schemeEligibilitySplit.pending.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">All scoped schemes are already eligible.</p>
                                  ) : (
                                    <ul className="space-y-2">
                                      {schemeEligibilitySplit.pending.map((s, pendIdx) => {
                                        const applyIdx = schemeEligibilitySplit.eligible.length + pendIdx;
                                        const totalApply = schemeApplyChain.length;
                                        return (
                                        <li key={s.id} className="rounded-md border border-dashed bg-muted/30 p-2 text-xs">
                                          <div className="font-semibold leading-tight">{s.scheme_name}</div>
                                          <div className="mt-0.5 text-[10px] text-muted-foreground">{s.customer_category_name}</div>
                                          <div className="mt-1 text-[10px] text-[#5b655f]">
                                            Condition: {s.condition_basis} ≥ {s.threshold_value} {s.threshold_unit}
                                          </div>
                                          <div className="mt-1 text-[11px] text-[#374151]">{describeSchemeGap(lines, s)}</div>
                                          <div className="mt-1 font-medium">
                                            {s.reward_type === "DISCOUNT"
                                              ? `Reward: ${s.reward_discount_percent ?? "0"}% discount`
                                              : `Reward: ${s.reward_product_name ?? "item"} × ${s.reward_product_quantity ?? ""}`}
                                          </div>
                                          <Button
                                            asChild
                                            size="sm"
                                            variant="secondary"
                                            className="mt-2 h-7 w-full text-xs font-semibold"
                                            disabled={!canWriteSales}
                                          >
                                            <button
                                              type="button"
                                              ref={(el) => {
                                                schemeApplyBtnRefs.current[applyIdx] = el;
                                              }}
                                              onKeyDown={(e) => handleSchemeApplyButtonKeyDown(e, index, applyIdx, totalApply)}
                                              onClick={() => void applySchemeToLine(s, index)}
                                            >
                                              Apply (adjust qty to threshold)
                                            </button>
                                          </Button>
                                        </li>
                                        );
                                      })}
                                    </ul>
                                  )}
                                </div>
                              </div>
                            )}
                            <p className="border-t px-3 py-2 text-[10px] text-muted-foreground">
                              Keyboard: ↓ to first Apply, ↓/↑ between buttons, Enter to apply, Esc to close. Only schemes scoped to this line&apos;s product are listed.
                            </p>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell className="w-[75px] py-0.5">
                        <Input
                          id={`line-${index}-discountLumpsum`}
                          name={`line-${index}-discountLumpsum`}
                          aria-label="Discount Lumpsum"
                          ref={setLineRef(line.id, "discountLumpsum")}
                          value={line.discountLumpsum}
                          readOnly={viewOnly}
                          onFocus={() => {
                            setActiveRow(index);
                            setActiveField("discountLumpsum");
                            onDiscountSchemesFocus(index, "discountLumpsum");
                          }}
                          onChange={(e) => updateLine(index, { discountLumpsum: sanitizeMoneyInput2dp(e.target.value) })}
                          onBlur={(e) => {
                            const r = roundMoney2(e.target.value);
                            if (r !== line.discountLumpsum) updateLine(index, { discountLumpsum: r });
                          }}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "discountLumpsum")}
                          className={cn(
                            COMPACT_GRID_INPUT_BASE,
                            "text-center",
                            viewReadOnlyLineInput,
                            index === activeRow && activeField === "discountLumpsum" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : ""
                          )}
                        />
                      </TableCell>
                      <TableCell className="w-[90px] py-0.5">
                        <Input
                          id={`line-${index}-taxable`}
                          name={`line-${index}-taxable`}
                          aria-label="Taxable amount"
                          readOnly
                          tabIndex={0}
                          ref={setLineRef(line.id, "taxable")}
                          value={computeLineTaxableAmount(line).toFixed(2)}
                          onFocus={() => {
                            setActiveRow(index);
                            setActiveField("taxable");
                          }}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "taxable")}
                          className={cn(
                            COMPACT_GRID_INPUT_BASE,
                            "cursor-default text-right",
                            index === activeRow && activeField === "taxable" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : ""
                          )}
                        />
                      </TableCell>
                      <TableCell className="w-[90px] py-0.5">
                        <Input
                          id={`line-${index}-lineAmount`}
                          name={`line-${index}-lineAmount`}
                          aria-label="Line amount"
                          readOnly
                          tabIndex={0}
                          ref={setLineRef(line.id, "lineAmount")}
                          value={Number(line.amount || 0).toFixed(2)}
                          onFocus={() => {
                            setActiveRow(index);
                            setActiveField("lineAmount");
                          }}
                          onKeyDown={(e) => handleLineFieldKeyDown(e, index, "lineAmount")}
                          className={cn(
                            COMPACT_GRID_INPUT_BASE,
                            "cursor-default text-right",
                            index === activeRow && activeField === "lineAmount" ? "bg-white ring-2 ring-[#2f5d50] ring-inset" : ""
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

              <div className="grid gap-px border-t bg-border md:grid-cols-[1fr_1fr]">
              <div className="bg-[#fbfcf7] p-3 text-sm">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#6a746e]">Selected item</div>
                  {activeLine?.product ? (
                  (() => {
                    const convLines = productUnitConversionLines(activeLine.product);
                    return (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <div className="text-sm font-semibold leading-snug md:col-span-2">{activeLine.product.name}</div>
                    <div className="text-xs text-[#5b655f] md:col-span-2">{activeLine.product.brand || "—"}</div>
                    <div className="text-sm">Stock: <span className="font-semibold">{activeLine.product.stock_ratio}</span></div>
                    <div className="text-sm">MRP: <span className="font-semibold">{Number(activeLine.product.mrp).toFixed(2)}</span></div>
                    <div className="text-sm md:col-span-2">Selling: <span className="font-semibold">{Number(activeLine.product.selling_price || activeLine.product.latest_rate_value || 0).toFixed(2)}</span></div>
                    {convLines.length ? (
                      <div className="md:col-span-2 mt-1 space-y-1 border-t border-[#dde6dc] pt-2">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6a746e]">Unit conversion</div>
                        {convLines.map((line, idx) => (
                          <div key={`${line}-${idx}`} className="text-xs text-[#3d4a42]">
                            {line}
                    </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                    );
                  })()
                  ) : (
                    <div className="mt-2 text-sm text-muted-foreground">Select product to view detail.</div>
                  )}
                </div>
              <div className="bg-[#fbfcf7] p-3 text-sm">
                <div className="grid grid-cols-2 gap-y-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#3d5249]">Value of goods</div><div className="text-right text-sm font-semibold">{totals.valueOfGoods.toFixed(2)}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#3d5249]">Discount</div><div className="text-right text-sm font-semibold">{totals.discount.toFixed(2)}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#3d5249]">GST</div><div className="text-right text-sm font-semibold">{totals.gst.toFixed(2)}</div>
                  <div className="self-center text-xs font-semibold uppercase tracking-wide text-[#3d5249]">Freight</div>
                  <div>
                    <Label htmlFor="freightAmount" className="sr-only">Freight</Label>
                    <Input
                      id="freightAmount"
                      name="freightAmount"
                      ref={freightRef}
                      className={cn(
                        "h-8 rounded-none border-x-0 border-t-0 bg-transparent text-right text-sm font-semibold text-[#111714] shadow-none",
                        viewReadOnlyLineInput,
                      )}
                      value={freightAmount}
                      readOnly={viewOnly}
                      onChange={(e) => setFreightAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusFooterField("save");
                        } else if (e.key === "ArrowDown") {
                          e.preventDefault();
                          focusFooterField("save");
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const lastFilledRow = lines.findLastIndex((line) => line.product !== null);
                          if (lastFilledRow >= 0) {
                            focusLineField(lastFilledRow, "product");
                          }
                        }
                      }}
                    />
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-[#3d5249]">Round off</div><div className="text-right text-sm font-semibold">{totals.roundOff.toFixed(2)}</div>
                  <div className="pt-1 text-xs font-bold uppercase tracking-wide text-[#2f5d50]">Final bill</div><div className="pt-1 text-right text-base font-bold">{totals.finalAmount.toFixed(2)}</div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button
                    ref={saveButtonRef}
                    className="rounded-sm"
                    onClick={() => void saveEntry()}
                    disabled={saving || !canWriteSales}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        focusFooterField("freight");
                      }
                    }}
                  >
                    {saving ? "Saving..." : `Save ${mode === "challan" ? "Challan" : "Invoice"}`}
                  </Button>
                  <Button variant="outline" onClick={() => void showLedger()} disabled={!customerSummary}>
                    Ledger
                  </Button>
                  {activeLine?.product ? (
                    <Button
                      variant="outline"
                      tabIndex={viewOnly ? -1 : 0}
                      className={cn(viewOnly && "pointer-events-none cursor-default opacity-100")}
                      onClick={() => {
                        if (viewOnly) return;
                        void openProductEdit(activeLine.product!);
                      }}
                    >
                      Edit Product
                    </Button>
                  ) : null}
                  {onClose && <Button variant="secondary" onClick={requestClose}>Back</Button>}
                </div>
              </div>
            </div>

            {activeLine?.product && (
              <div className="border-t bg-[#fbfcf7] p-4">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-[#6a746e]">Recent interaction history</div>
                {activeLine.product.recent_bills.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#dde6dc] text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2.5 font-semibold">Date</th>
                          <th className="pb-2.5 font-semibold">Bill No</th>
                          <th className="pb-2.5 text-right font-semibold">Qty</th>
                          <th className="pb-2.5 font-semibold">Unit</th>
                          <th className="pb-2.5 text-right font-semibold">MRP</th>
                          <th className="pb-2.5 text-right font-semibold">Price</th>
                          <th className="pb-2.5 text-right font-semibold">Disc %</th>
                          <th className="pb-2.5 text-right font-semibold">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeLine.product.recent_bills.map((bill) => (
                          <tr key={`${bill.bill_number}-${bill.bill_date}`} className="border-b border-[#f0f4f0] last:border-0">
                            <td className="py-2.5">{formatDisplayDate(bill.bill_date)}</td>
                            <td className="py-2.5 font-medium">{bill.bill_number}</td>
                            <td className="py-2.5 text-right">{Number(bill.quantity).toFixed(2)}</td>
                            <td className="py-2.5">{bill.unit_name}</td>
                            <td className="py-2.5 text-right">{Number(bill.mrp).toFixed(2)}</td>
                            <td className="py-2.5 text-right">{Number(bill.rate_value).toFixed(2)}</td>
                            <td className="py-2.5 text-right">{Number(bill.discount_percent).toFixed(2)}%</td>
                            <td className="py-2.5 text-right font-semibold">{Number(bill.line_total_amount).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-sm text-muted-foreground">No recent interactions found for this product.</div>
                )}
              </div>
            )}
          </div>

          <div className="grid min-h-full gap-px self-stretch bg-border shadow-[inset_1px_0_0_0_rgba(89,120,111,0.12)]">
            <div className="flex min-h-full min-w-0 flex-col bg-[#fbfcf7] text-sm">
              <div className="border-b border-[#59786f]/25 bg-[#6f9186] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.28em] text-white shadow-sm">
                Customer history
              </div>
              <div className="flex flex-1 flex-col gap-0 p-0">
              {customerSummary ? (
                <div className="flex flex-1 flex-col">
                  <div className="border-b border-[#dde8e0] bg-[#f0f7f2] px-4 py-3">
                    <div className="mb-2 rounded-md bg-[#2f5d50] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white shadow-sm">
                      Customer snapshot
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div className="text-[#5b655f]">Annual sales</div><div className="text-right font-semibold text-[#111714]">{Number(customerSummary.annual_sales_amount).toFixed(2)}</div>
                      <div className="text-[#5b655f]">Month sales</div><div className="text-right font-semibold text-[#111714]">{Number(customerSummary.monthly_sales_amount).toFixed(2)}</div>
                      <div className="text-[#5b655f]">Balance</div><div className="text-right font-semibold text-[#111714]">{Number(customerSummary.balance).toFixed(2)} {customerSummary.balance_side}</div>
                      <div className="text-[#5b655f]">Last sale</div><div className="text-right font-semibold text-[#111714]">{customerSummary.last_sale_date ? formatDisplayDate(customerSummary.last_sale_date) : "—"}</div>
                      <div className="text-[#5b655f]">Last receipt</div><div className="text-right font-semibold text-[#111714]">{customerSummary.last_receipt_date ? formatDisplayDate(customerSummary.last_receipt_date) : "—"}</div>
                      <div className="text-[#5b655f]">GSTIN</div><div className="text-right font-mono text-[11px] font-semibold text-[#111714]">{customerSummary.gstin || "—"}</div>
                      <div className="text-[#5b655f]">Type</div><div className="text-right font-semibold text-[#111714]">{taxType}</div>
                      <div className="text-[#5b655f]">Area / route</div><div className="text-right font-semibold text-[#111714]">{customerSummary.area || "—"} / {customerSummary.route || "—"}</div>
                    </div>
                  </div>
                  <div className="border-b border-[#dde8e0] px-4 py-3">
                    <div className="mb-2 rounded-md bg-[#c8e087] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#1e3318] shadow-sm">
                      Last 3 bills
                    </div>
                    <div className="space-y-2">
                      {customerSummary.last_bills.map((bill) => (
                        <div key={`${bill.bill_number}-${bill.bill_date}`} className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-md border border-[#dde8e0] bg-white px-2 py-1.5 text-xs shadow-sm">
                          <span className="truncate font-medium">{bill.bill_number}</span>
                          <span className="text-[#5b655f]">{formatDisplayDate(bill.bill_date)}</span>
                          <span className="text-right font-semibold">{Number(bill.total_amount).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-4 py-3">
                    <div className="mb-2 rounded-md bg-[#8eb8ad] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white shadow-sm">
                      Available challans
                    </div>
                    <div className="space-y-2">
                      {customerSummary.open_challans.length ? customerSummary.open_challans.map((challan) => (
                        <button
                          key={challan.challan_id}
                          type="button"
                          className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 rounded-md border border-[#dde8e0] bg-white px-2 py-1.5 text-left text-xs shadow-sm transition-colors hover:border-[#2f5d50]/40 hover:bg-[#f4faf6]"
                          onClick={(e) => {
                             e.preventDefault();
                             setLocalSourceChallanId(challan.challan_id);
                          }}
                        >
                          <span className="truncate font-medium">{challan.reference_no}</span>
                          <span className="text-[#5b655f]">{challan.challan_date ? formatDisplayDate(challan.challan_date) : "—"}</span>
                          <span className="text-right font-semibold">{challan.item_count} items</span>
                        </button>
                      )) : <div className="rounded-md border border-dashed border-[#b8c9bf] bg-[#f7faf8] px-3 py-4 text-center text-xs text-muted-foreground">No challans linked to this customer.</div>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-1 flex-col gap-0">
                  <div className="border-b border-[#dde8e0] px-4 py-4">
                    <div className="rounded-md border border-dashed border-[#b8c9bf] bg-[#f7faf8] px-3 py-4 text-center text-xs text-muted-foreground">
                      Select a customer to load sales history and balances.
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col px-4 py-3">
                    <div className="mb-2 rounded-md bg-[#c8e087] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#1e3318] shadow-sm">
                      All pending orders
                    </div>
                    <div className="space-y-3">
                      {generalOpenChallans.length ? generalOpenChallans.map((challan) => (
                        <div key={challan.challan_id} className="space-y-1 rounded-md border border-[#dde8e0] bg-white p-2 text-xs shadow-sm">
                          <div className="flex justify-between font-semibold">
                            <span className="text-[#2f5d50]">{challan.customer_name}</span>
                            <span>{challan.reference_no}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                             <span>{challan.challan_date ? formatDisplayDate(challan.challan_date) : "—"}</span>
                             <span>{challan.item_count} items</span>
                          </div>
                        </div>
                      )) : <div className="rounded-md border border-dashed border-[#b8c9bf] bg-[#f7faf8] px-3 py-4 text-center text-xs text-muted-foreground">No pending orders available.</div>}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Dialogs moved back inside or to stable position */}
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
                  setTimeout(() => billNumberRef.current?.focus(), 0);
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
                    setPaymentMode(PAYMENT_MODE_OPTIONS[paymentModeIndex]);
                    setPaymentModeOpen(false);
                    setTimeout(() => billNumberRef.current?.focus(), 0);
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
                    setWarehouseId(warehouses[warehouseIndex].id);
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
          <span><span className="font-semibold text-foreground">Ctrl/⌘+⌫</span> delete row</span>
          <span><span className="font-semibold text-foreground">Ctrl+S</span> save bill</span>
        </div>
      </div>

      {customerSearchOpen ? (
        <div className="absolute inset-0 z-30 grid bg-card md:grid-cols-[1.2fr_0.9fr]">
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center justify-between border-b bg-[#6d9187] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
              <span>Customer Selector</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-8 border-white/30 bg-transparent px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setCustomerCreateOpen(true)}>+ Add Customer</Button>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-white hover:bg-white/10 hover:text-white" onClick={() => setCustomerSearchOpen(false)}>Esc</Button>
              </div>
            </div>
            <div className="border-b bg-background p-3">
              <Input
                ref={customerSearchRef}
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Type customer name"
                className="h-11 border-0 bg-muted text-base font-semibold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCustomerIndex((prev) =>
                      Math.min(prev + 1, Math.max(0, customerResults.length - 1)),
                    );
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCustomerIndex((prev) => Math.max(prev - 1, 0));
                  }
                  if (e.key === "Enter") {
                    if (!customerResults.length) return;
                    e.preventDefault();
                    const idx = Math.min(customerIndex, customerResults.length - 1);
                    selectCustomer(customerResults[idx]);
                  }
                }}
              />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_120px] border-b bg-[#e6efcf] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
              <span>Ledger</span>
              <span className="text-right">Balance</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {customerResults.map((customer, index) => (
                <button
                  key={customer.customer_id}
                  type="button"
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_120px] items-center border-b px-4 py-3 text-left text-sm",
                    index === customerIndex ? "bg-[#2f5d50] text-white" : "hover:bg-muted/50"
                  )}
                  onMouseEnter={() => setCustomerIndex(index)}
                  onClick={() => selectCustomer(customer)}
                >
                  <div>
                    <div className="font-semibold">{customer.customer_name}</div>
                    <div className={cn("mt-1 truncate text-xs", index === customerIndex ? "text-white/80" : "text-muted-foreground")}>
                      {customer.city || "-"} {customer.state ? `• ${customer.state}` : ""}
                    </div>
                  </div>
                  <span className="text-right font-semibold">{Number(customer.balance).toFixed(2)} {customer.balance_side}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto bg-[#f8faf7] p-4 text-sm">
            {customerResults[customerIndex] ? (
              <>
                <div className="text-lg font-semibold">{customerResults[customerIndex].customer_name}</div>
                <div className="mt-2 text-muted-foreground">{customerResults[customerIndex].address_lines.join(", ")}</div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border bg-background p-4 text-sm">
                  <div>GSTIN</div><div className="text-right font-semibold">{customerResults[customerIndex].gstin || "-"}</div>
                  <div>Phone</div><div className="text-right font-semibold">{customerResults[customerIndex].phone || "-"}</div>
                  <div>Area</div><div className="text-right font-semibold">{customerResults[customerIndex].area || "-"}</div>
                  <div>Route</div><div className="text-right font-semibold">{customerResults[customerIndex].route || "-"}</div>
                  <div>Brands</div><div className="text-right font-semibold">{customerResults[customerIndex].brand_names.length ? customerResults[customerIndex].brand_names.join(", ") : "None linked"}</div>
                  <div>Monthly Sales</div><div className="text-right font-semibold">{Number(customerResults[customerIndex].monthly_sales_amount).toFixed(2)}</div>
                  <div>Annual Sales</div><div className="text-right font-semibold">{Number(customerResults[customerIndex].annual_sales_amount).toFixed(2)}</div>
                  <div>Last Sale</div><div className="text-right font-semibold">{customerResults[customerIndex].last_sale_date ? formatDisplayDate(customerResults[customerIndex].last_sale_date) : "-"}</div>
                  <div>Last Receipt</div><div className="text-right font-semibold">{customerResults[customerIndex].last_receipt_date ? formatDisplayDate(customerResults[customerIndex].last_receipt_date) : "-"}</div>
                </div>
                <div className="mt-4 rounded-lg border bg-background p-4">
                  <div className="mb-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Last 3 Bills</div>
                  <div className="space-y-2">
                    {customerResults[customerIndex].last_bills.map((bill) => (
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
                    {customerResults[customerIndex].open_challans.length ? customerResults[customerIndex].open_challans.map((challan) => (
                        <button
                          key={challan.challan_id}
                          type="button"
                          className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-2 text-left text-xs hover:bg-muted/50 rounded py-1 px-1 -mx-1 transition-colors"
                          onClick={(e) => {
                             e.preventDefault();
                             setLocalSourceChallanId(challan.challan_id);
                             setCustomerSearchOpen(false);
                             selectCustomer(customerResults[customerIndex]);
                          }}
                        >
                        <span>{challan.reference_no}</span>
                        <span>{challan.challan_date ? formatDisplayDate(challan.challan_date) : "-"}</span>
                        <span className="text-right font-semibold">{challan.item_count} items</span>
                        </button>
                    )) : <div className="text-xs text-muted-foreground">No open challans.</div>}
                  </div>
                </div>
              </>
            ) : <div className="text-muted-foreground">No customer selected.</div>}
          </div>
        </div>
      ) : null}

      {productSearchOpen ? (
        <div className="absolute inset-0 z-30 grid bg-card md:grid-cols-[1.25fr_0.95fr]">
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center justify-between border-b bg-[#6d9187] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white">
              <span>Product Selector</span>
              <div className="flex items-center gap-2">
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
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setProductIndex((prev) =>
                      Math.min(prev + 1, Math.max(0, productResults.length - 1)),
                    );
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setProductIndex((prev) => Math.max(prev - 1, 0));
                  }
                  if (e.key === "Enter") {
                    if (!productResults.length) return;
                    e.preventDefault();
                    const idx = Math.min(productIndex, productResults.length - 1);
                    void selectProduct(productResults[idx], productTargetRow);
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
                    onClick={() => void selectProduct(product, productTargetRow)}
                  >
                    <div>
                      <div className="font-semibold">{product.name}</div>
                      <div className={cn("mt-1 truncate text-xs", index === productIndex ? "text-white/80" : "text-muted-foreground")}>
                        {product.sku}{product.brand ? ` • ${product.brand}` : ""}
                      </div>
                    </div>
                    <span className="text-right font-semibold">{product.stock_ratio}</span>
                    <span className="text-right font-semibold">{Number(product.selling_price || product.latest_rate_value || 0).toFixed(2)}</span>
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
                  <div>Price</div><div className="text-right font-semibold">{Number(productResults[productIndex].selling_price || productResults[productIndex].latest_rate_value || 0).toFixed(2)}</div>
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
              <select 
                disabled={productEditForm.has_interactions}
                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm disabled:bg-muted disabled:opacity-50" 
                value={productEditForm.primary_unit_id} 
                onChange={(e) => setProductEditForm((prev) => ({ ...prev, primary_unit_id: e.target.value }))}
              >
                <option value="">Select unit</option>
                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.unit_code} - {item.unit_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Secondary Unit</Label>
              <select 
                disabled={productEditForm.has_interactions}
                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm disabled:bg-muted disabled:opacity-50" 
                value={productEditForm.secondary_unit_id} 
                onChange={(e) => setProductEditForm((prev) => ({ ...prev, secondary_unit_id: e.target.value }))}
              >
                <option value="">Optional</option>
                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.unit_code} - {item.unit_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>1 second = ? first</Label>
              <Input 
                disabled={productEditForm.has_interactions}
                value={productEditForm.secondary_unit_quantity} 
                onChange={(e) => setProductEditForm((prev) => ({ ...prev, secondary_unit_quantity: e.target.value }))} 
                className="disabled:bg-muted"
              />
            </div>
            <div className="space-y-1">
              <Label>Third Unit</Label>
              <select 
                disabled={productEditForm.has_interactions}
                className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm disabled:bg-muted disabled:opacity-50" 
                value={productEditForm.third_unit_id} 
                onChange={(e) => setProductEditForm((prev) => ({ ...prev, third_unit_id: e.target.value }))}
              >
                <option value="">Optional</option>
                {unitOptions.map((item) => <option key={item.id} value={item.id}>{item.unit_code} - {item.unit_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>1 third = ? second</Label>
              <Input 
                disabled={productEditForm.has_interactions}
                value={productEditForm.third_unit_quantity} 
                onChange={(e) => setProductEditForm((prev) => ({ ...prev, third_unit_quantity: e.target.value }))} 
                className="disabled:bg-muted"
              />
            </div>
            <div className="space-y-1"><Label>Weight in grams</Label><Input value={productEditForm.weight_in_grams} onChange={(e) => setProductEditForm((prev) => ({ ...prev, weight_in_grams: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end"><Button onClick={() => void saveProductEdit()}>Save Product</Button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={customerCreateOpen} onOpenChange={(open) => {
        setCustomerCreateOpen(open);
        if (!open) {
          setTimeout(() => customerButtonRef.current?.focus(), 0);
        }
      }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto rounded-none border border-[#5f8277] bg-[#fcfdf8] font-mono sm:max-w-4xl">
          <DialogHeader className="-m-6 mb-4 border-b border-[#5f8277] bg-[#6d9187] px-6 py-3 text-white">
            <DialogTitle className="text-sm uppercase tracking-[0.24em]">Add Customer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="customer-firm-name">Firm Name</Label>
              <Input id="customer-firm-name" name="firm_name" ref={setCustomerCreateRef("firm_name")} value={customerCreateForm.firm_name} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, firm_name: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "firm_name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-sales-type">Type</Label>
              <select id="customer-sales-type" name="sales_type" ref={setCustomerCreateRef("sales_type")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={customerCreateForm.sales_type} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, sales_type: e.target.value as "LOCAL" | "CENTRAL" }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "sales_type")}><option value="CENTRAL">CENTRAL</option><option value="LOCAL">LOCAL</option></select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-gstin">GSTIN</Label>
              <Input id="customer-gstin" name="gstin" ref={setCustomerCreateRef("gstin")} value={customerCreateForm.gstin} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, gstin: e.target.value, sales_type: deriveSalesTypeFromGstin(e.target.value) }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "gstin")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-pan">PAN</Label>
              <Input id="customer-pan" name="pan" ref={setCustomerCreateRef("pan")} value={customerCreateForm.pan} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, pan: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "pan")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-owner-name">Owner Name</Label>
              <Input id="customer-owner-name" name="owner_name" ref={setCustomerCreateRef("owner_name")} value={customerCreateForm.owner_name} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, owner_name: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "owner_name")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-phone">Phone</Label>
              <Input id="customer-phone" name="phone" ref={setCustomerCreateRef("phone")} value={customerCreateForm.phone} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, phone: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "phone")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-alt-phone">Alternate Phone</Label>
              <Input id="customer-alt-phone" name="alternate_phone" ref={setCustomerCreateRef("alternate_phone")} value={customerCreateForm.alternate_phone} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, alternate_phone: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "alternate_phone")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-email">Email</Label>
              <Input id="customer-email" name="email" ref={setCustomerCreateRef("email")} value={customerCreateForm.email} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, email: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "email")} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="customer-street">Street</Label>
              <Input id="customer-street" name="street" ref={setCustomerCreateRef("street")} value={customerCreateForm.street} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, street: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "street")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-city">City</Label>
              <Input id="customer-city" name="city" ref={setCustomerCreateRef("city")} value={customerCreateForm.city} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, city: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "city")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-state">State</Label>
              <Input id="customer-state" name="state" ref={setCustomerCreateRef("state")} value={customerCreateForm.state} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, state: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "state")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-pincode">Pincode</Label>
              <Input id="customer-pincode" name="pincode" ref={setCustomerCreateRef("pincode")} value={customerCreateForm.pincode} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, pincode: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "pincode")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-bank-acc">Bank Account Number</Label>
              <Input id="customer-bank-acc" name="bank_account_number" ref={setCustomerCreateRef("bank_account_number")} value={customerCreateForm.bank_account_number} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, bank_account_number: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "bank_account_number")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="customer-ifsc">IFSC Code</Label>
              <Input id="customer-ifsc" name="ifsc_code" ref={setCustomerCreateRef("ifsc_code")} value={customerCreateForm.ifsc_code} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, ifsc_code: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "ifsc_code")} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="customer-acc-cat">Account Category</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setCustomerCategoryCreateOpen(true)}>+ Add Account Category</Button>
              </div>
              <select id="customer-acc-cat" name="account_category_id" ref={setCustomerCreateRef("account_category_id")} className="border-input h-10 w-full rounded-md border bg-background px-3 text-sm" value={customerCreateForm.account_category_id} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, account_category_id: e.target.value }))} onKeyDown={(e) => handleCustomerCreateKeyDown(e, "account_category_id")}><option value="">Optional</option>{customerCategoryOptions.map((option) => <option key={option.id} value={option.id}>{option.code} - {option.name}</option>)}</select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Brands</Label>
              <div className="grid max-h-40 gap-2 overflow-y-auto rounded-md border p-3 md:grid-cols-2">
                {brandOptions.map((brand) => (
                  <label key={brand.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={customerCreateForm.brand_ids.includes(brand.id)} onChange={(e) => setCustomerCreateForm((prev) => ({ ...prev, brand_ids: e.target.checked ? [...prev.brand_ids, brand.id] : prev.brand_ids.filter((id) => id !== brand.id) }))} />
                    <span>{brand.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button ref={customerCreateSaveRef} type="button" disabled={creatingCustomer || !customerCreateForm.firm_name.trim()} onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                void (e.currentTarget as HTMLButtonElement).click();
              }
            }} onClick={async () => {
              setCreatingCustomer(true);
              try {
                const created = asObject(await postBackend("/masters/customers", {
                  firm_name: customerCreateForm.firm_name.trim(),
                  sales_type: customerCreateForm.sales_type,
                  gstin: customerCreateForm.gstin.trim() || null,
                  pan: customerCreateForm.pan.trim() || null,
                  owner_name: customerCreateForm.owner_name.trim() || null,
                  phone: customerCreateForm.phone.trim() || null,
                  alternate_phone: customerCreateForm.alternate_phone.trim() || null,
                  email: customerCreateForm.email.trim() || null,
                  street: customerCreateForm.street.trim() || null,
                  city: customerCreateForm.city.trim() || null,
                  state: customerCreateForm.state.trim() || null,
                  pincode: customerCreateForm.pincode.trim() || null,
                  bank_account_number: customerCreateForm.bank_account_number.trim() || null,
                  ifsc_code: customerCreateForm.ifsc_code.trim() || null,
                  account_category_id: customerCreateForm.account_category_id || null,
                  brand_ids: customerCreateForm.brand_ids,
                }));
                const createdSummary = mapCustomerSummary(asObject(await fetchBackend(`/sales/sales-entry/customers/${String(created.id ?? "")}/summary`)));
                setCustomerCreateOpen(false);
                setCustomerCreateForm({ ...EMPTY_CUSTOMER_FORM });
                setCustomerSummary(createdSummary);
                setCustomerSearchOpen(false);
                toast.success("Customer created");
                setTimeout(() => paymentModeRef.current?.focus(), 0);
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create customer");
              } finally {
                setCreatingCustomer(false);
              }
            }}>{creatingCustomer ? "Saving..." : "Save Customer"}</Button>
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
                const createdSummary = mapProductSummary(asObject(await fetchBackend(`/sales/sales-entry/products/${String(created.id ?? "")}/summary`)));
                setProductCreateOpen(false);
                setProductCreateForm({ ...EMPTY_PRODUCT_FORM });
                void selectProduct(createdSummary, productTargetRow);
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
                <Label htmlFor="quick-code-sales">{quickCreateType === "unit" ? "Code" : "HSN Number"}</Label>
                <Input id="quick-code-sales" name="code" value={quickCode} onChange={(e) => setQuickCode(e.target.value)} />
              </div>
            ) : null}
            {quickCreateType !== "hsn" ? (
              <div className="space-y-1">
                <Label htmlFor="quick-name-sales">{quickCreateType === "unit" ? "Unit Name" : "Name"}</Label>
                <Input id="quick-name-sales" name="name" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
              </div>
            ) : null}
            {quickCreateType === "subCategory" ? (
              <div className="space-y-1">
                <Label htmlFor="quick-category-sales">Category</Label>
                <select
                  id="quick-category-sales"
                  name="category_id"
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
                  <Label htmlFor="quick-description-sales">Description</Label>
                  <Input id="quick-description-sales" name="description" value={quickDescription} onChange={(e) => setQuickDescription(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="quick-gst-sales">GST %</Label>
                  <Input id="quick-gst-sales" name="gst_percent" value={quickGst} onChange={(e) => setQuickGst(e.target.value)} />
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

      <Dialog open={customerCategoryCreateOpen} onOpenChange={setCustomerCategoryCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Customer Account Category</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={customerCategoryForm.code} onChange={(e) => setCustomerCategoryForm((prev) => ({ ...prev, code: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={customerCategoryForm.name} onChange={(e) => setCustomerCategoryForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input value={customerCategoryForm.description} onChange={(e) => setCustomerCategoryForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCustomerCategoryCreateOpen(false)}>Cancel</Button>
            <Button
              type="button"
              onClick={() => void createInlineCustomerCategory()}
              disabled={creatingCustomerCategory || !customerCategoryForm.code.trim() || !customerCategoryForm.name.trim()}
            >
              {creatingCustomerCategory ? "Adding..." : "Add Account Category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ledgerOpen} onOpenChange={setLedgerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader><DialogTitle>Customer Ledger</DialogTitle></DialogHeader>
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
