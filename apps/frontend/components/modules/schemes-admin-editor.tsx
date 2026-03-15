"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, fetchPortalMe, patchBackend, postBackend } from "@/lib/backend-api";
import { usePersistedUiState } from "@/lib/state/pagination-hooks";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

type CustomerType = "B2B" | "B2C";
type ConditionBasis = "VALUE" | "WEIGHT" | "QUANTITY";
type ThresholdUnit = "INR" | "GM" | "KG" | "PIECE";
type RewardType = "DISCOUNT" | "FREE_ITEM";

type CustomerCategory = {
  id: string;
  name: string;
  customer_type: CustomerType;
  price_class: "A" | "B" | "C";
};

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  display_name: string;
  brand: string;
  category: string;
  sub_category: string;
};

type SchemeRow = {
  id: string;
  scheme_name: string;
  customer_category_id: string;
  customer_category_name: string;
  condition_basis: ConditionBasis;
  threshold_value: string;
  threshold_unit: ThresholdUnit;
  brand: string;
  category: string;
  sub_category: string;
  product_id: string;
  product_name: string;
  reward_type: RewardType;
  reward_discount_percent: string;
  reward_product_id: string;
  reward_product_name: string;
  reward_product_quantity: string;
  note: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const EMPTY_FORM = {
  scheme_name: "",
  customer_category_id: "",
  condition_basis: "VALUE" as ConditionBasis,
  threshold_value: "",
  threshold_unit: "INR" as ThresholdUnit,
  brand: "",
  category: "",
  sub_category: "",
  product_id: "",
  reward_type: "DISCOUNT" as RewardType,
  reward_discount_percent: "",
  reward_product_id: "",
  reward_product_quantity: "",
  note: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  is_active: true,
};

const defaultSchemesUiState = {
  searchText: "",
  appliedSearch: "",
  statusFilter: "ALL" as "ALL" | "ACTIVE" | "INACTIVE",
  createOpen: false,
  editingId: "",
  rewardProductSearch: "",
  form: { ...EMPTY_FORM },
};

function mapCategory(row: Record<string, unknown>): CustomerCategory {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    customer_type: String(row.customer_type ?? "B2C") === "B2B" ? "B2B" : "B2C",
    price_class: (["A", "B", "C"].includes(String(row.price_class ?? "C")) ? String(row.price_class ?? "C") : "C") as
      | "A"
      | "B"
      | "C",
  };
}

function mapProduct(row: Record<string, unknown>): ProductOption {
  return {
    id: String(row.id ?? ""),
    sku: String(row.sku ?? ""),
    name: String(row.name ?? ""),
    display_name: String(row.display_name ?? row.name ?? ""),
    brand: String(row.brand ?? ""),
    category: String(row.category ?? ""),
    sub_category: String(row.sub_category ?? ""),
  };
}

function mapScheme(row: Record<string, unknown>): SchemeRow {
  return {
    id: String(row.id ?? ""),
    scheme_name: String(row.scheme_name ?? ""),
    customer_category_id: String(row.customer_category_id ?? ""),
    customer_category_name: String(row.customer_category_name ?? "-"),
    condition_basis: (String(row.condition_basis ?? "VALUE") as ConditionBasis) || "VALUE",
    threshold_value: String(row.threshold_value ?? "0"),
    threshold_unit: (String(row.threshold_unit ?? "INR") as ThresholdUnit) || "INR",
    brand: String(row.brand ?? ""),
    category: String(row.category ?? ""),
    sub_category: String(row.sub_category ?? ""),
    product_id: String(row.product_id ?? ""),
    product_name: String(row.product_name ?? ""),
    reward_type: (String(row.reward_type ?? "DISCOUNT") as RewardType) || "DISCOUNT",
    reward_discount_percent: String(row.reward_discount_percent ?? ""),
    reward_product_id: String(row.reward_product_id ?? ""),
    reward_product_name: String(row.reward_product_name ?? ""),
    reward_product_quantity: String(row.reward_product_quantity ?? ""),
    note: String(row.note ?? ""),
    start_date: String(row.start_date ?? ""),
    end_date: String(row.end_date ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

function formatScope(row: SchemeRow) {
  if (row.product_name) {
    return row.product_name;
  }
  if (row.sub_category) {
    return [row.brand, row.category, row.sub_category].filter(Boolean).join(" / ");
  }
  if (row.category) {
    return [row.brand, row.category].filter(Boolean).join(" / ");
  }
  if (row.brand) {
    return row.brand;
  }
  return "All products";
}

function formatReward(row: SchemeRow) {
  if (row.reward_type === "DISCOUNT") {
    return `${row.reward_discount_percent || "0"}% discount`;
  }
  return `${row.reward_product_name || "Free item"} x ${row.reward_product_quantity || "0"}`;
}

function buildApplicabilityLabel(form: typeof EMPTY_FORM, categories: CustomerCategory[]) {
  const categoryName = categories.find((item) => item.id === form.customer_category_id)?.name || "selected customers";
  const scope = form.product_id
    ? "selected product"
    : form.sub_category
      ? [form.brand, form.category, form.sub_category].filter(Boolean).join(" / ")
      : form.category
        ? [form.brand, form.category].filter(Boolean).join(" / ")
        : form.brand
          ? form.brand
          : "all products";
  const reward =
    form.reward_type === "DISCOUNT"
      ? `${form.reward_discount_percent || "0"}% discount`
      : `${form.reward_product_quantity || "0"} x free item`;
  return `Applies to ${categoryName} on ${scope} when ${form.condition_basis.toLowerCase()} reaches ${form.threshold_value || "0"} ${form.threshold_unit}. Reward: ${reward}.`;
}

function toFormFromRow(row: SchemeRow) {
  return {
    scheme_name: row.scheme_name,
    customer_category_id: row.customer_category_id,
    condition_basis: row.condition_basis,
    threshold_value: row.threshold_value,
    threshold_unit: row.threshold_unit,
    brand: row.brand || "",
    category: row.category || "",
    sub_category: row.sub_category || "",
    product_id: row.product_id || "",
    reward_type: row.reward_type,
    reward_discount_percent: row.reward_discount_percent || "",
    reward_product_id: row.reward_product_id || "",
    reward_product_quantity: row.reward_product_quantity || "",
    note: row.note || "",
    start_date: row.start_date,
    end_date: row.end_date,
    is_active: row.is_active,
  };
}

export function SchemesAdminEditor() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadSchemes, setCanReadSchemes] = useState(false);
  const [canWriteSchemes, setCanWriteSchemes] = useState(false);
  const { state: persistedUiState, setState: setPersistedUiState } = usePersistedUiState(
    "schemes-admin-ui",
    defaultSchemesUiState
  );
  const [rows, setRows] = useState<SchemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchText, setSearchText] = useState(persistedUiState.searchText);
  const [appliedSearch, setAppliedSearch] = useState(persistedUiState.appliedSearch);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">(persistedUiState.statusFilter);
  const [createOpen, setCreateOpen] = useState(Boolean(persistedUiState.createOpen));
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(persistedUiState.editingId || null);
  const [form, setForm] = useState({ ...persistedUiState.form });

  const [categories, setCategories] = useState<CustomerCategory[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<string[]>([]);
  const [scopeProducts, setScopeProducts] = useState<ProductOption[]>([]);
  const [rewardProductSearch, setRewardProductSearch] = useState(persistedUiState.rewardProductSearch);
  const [rewardProductOptions, setRewardProductOptions] = useState<ProductOption[]>([]);

  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<CustomerType>("B2B");
  const [newCategoryPriceClass, setNewCategoryPriceClass] = useState<"A" | "B" | "C">("A");

  const thresholdUnitOptions = useMemo(() => {
    if (form.condition_basis === "VALUE") {
      return ["INR"] as ThresholdUnit[];
    }
    if (form.condition_basis === "WEIGHT") {
      return ["GM", "KG"] as ThresholdUnit[];
    }
    return ["PIECE"] as ThresholdUnit[];
  }, [form.condition_basis]);

  useEffect(() => {
    setPersistedUiState({
      searchText,
      appliedSearch,
      statusFilter,
      createOpen,
      editingId: editingId ?? "",
      rewardProductSearch,
      form,
    });
  }, [appliedSearch, createOpen, editingId, form, rewardProductSearch, searchText, setPersistedUiState, statusFilter]);

  const loadSchemes = useCallback(async (search = appliedSearch, filter: "ALL" | "ACTIVE" | "INACTIVE" = statusFilter) => {
    if (!canReadSchemes) {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setFeedback("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (filter === "ACTIVE" || filter === "INACTIVE") {
        params.set("status", filter);
      }
      const path = params.size ? `/schemes?${params.toString()}` : "/schemes";
      const data = asArray(await fetchBackend(path));
      setRows(data.map((row) => mapScheme(asObject(row))));
    } catch (error) {
      setRows([]);
      const message = `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, statusFilter]);

  async function loadCategories() {
    if (!canReadSchemes) {
      return;
    }
    try {
      const res = asObject(await fetchBackend("/masters/customer-categories?page=1&page_size=100"));
      setCategories(asArray(res.items).map((row) => mapCategory(asObject(row))));
    } catch {
      setCategories([]);
    }
  }

  async function loadScopeMeta() {
    if (!canReadSchemes) {
      return;
    }
    try {
      const res = asObject(await fetchBackend("/schemes/meta/scope"));
      setBrands(asArray(res.brands).map((item) => String(item)));
    } catch {
      setBrands([]);
    }
  }

  async function loadRewardProducts(searchText: string) {
    if (!canReadSchemes) {
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("include_total", "false");
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const res = asObject(await fetchBackend(`/masters/products?${params.toString()}`));
      setRewardProductOptions(asArray(res.items).map((row) => mapProduct(asObject(row))));
    } catch {
      setRewardProductOptions([]);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = asObject(await fetchPortalMe());
        const isSuperAdmin = Boolean(payload.is_super_admin);
        const permission = asObject(asObject(payload.admin_permissions).schemes);
        if (!active) {
          return;
        }
        setCanReadSchemes(isSuperAdmin || Boolean(permission.read) || Boolean(permission.write));
        setCanWriteSchemes(isSuperAdmin || Boolean(permission.write));
        setPermissionsLoaded(true);
      } catch {
        if (!active) {
          return;
        }
        setCanReadSchemes(false);
        setCanWriteSchemes(false);
        setPermissionsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!permissionsLoaded || !canReadSchemes) {
      setLoading(false);
      return;
    }
    void Promise.all([loadSchemes(), loadCategories(), loadScopeMeta()]);
  }, [permissionsLoaded, canReadSchemes, loadSchemes]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setAppliedSearch(searchText);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [searchText]);

  useEffect(() => {
    void loadSchemes(appliedSearch, statusFilter);
  }, [appliedSearch, loadSchemes, statusFilter]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, threshold_unit: thresholdUnitOptions[0] }));
  }, [thresholdUnitOptions]);

  useEffect(() => {
    if (!form.brand) {
      setCategoryOptions([]);
      setSubCategoryOptions([]);
      setScopeProducts([]);
      return;
    }
    void (async () => {
      try {
        const rows = asArray(await fetchBackend(`/schemes/meta/categories?brand=${encodeURIComponent(form.brand)}`));
        setCategoryOptions(rows.map((item) => String(item)));
      } catch {
        setCategoryOptions([]);
      }
    })();
  }, [form.brand]);

  useEffect(() => {
    if (!form.brand || !form.category) {
      setSubCategoryOptions([]);
      setScopeProducts([]);
      return;
    }
    void (async () => {
      try {
        const rows = asArray(
          await fetchBackend(
            `/schemes/meta/sub-categories?brand=${encodeURIComponent(form.brand)}&category=${encodeURIComponent(form.category)}`
          )
        );
        setSubCategoryOptions(rows.map((item) => String(item)));
      } catch {
        setSubCategoryOptions([]);
      }
    })();
  }, [form.brand, form.category]);

  useEffect(() => {
    if (!form.brand || !form.category || !form.sub_category) {
      setScopeProducts([]);
      return;
    }
    void (async () => {
      try {
        const rows = asArray(
          await fetchBackend(
            `/schemes/meta/products?brand=${encodeURIComponent(form.brand)}&category=${encodeURIComponent(form.category)}&sub_category=${encodeURIComponent(form.sub_category)}`
          )
        );
        setScopeProducts(rows.map((row) => mapProduct(asObject(row))));
      } catch {
        setScopeProducts([]);
      }
    })();
  }, [form.brand, form.category, form.sub_category]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      void loadRewardProducts(rewardProductSearch);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [rewardProductSearch]);

  async function createInlineCategory() {
    if (!canWriteSchemes) {
      return;
    }
    if (!newCategoryCode.trim() || !newCategoryName.trim()) {
      toast.error("Category code and name are required.");
      return;
    }
    setCreatingCategory(true);
    try {
      const created = asObject(
        await postBackend("/masters/customer-categories", {
          code: newCategoryCode.trim(),
          name: newCategoryName.trim(),
          customer_type: newCategoryType,
          price_class: newCategoryPriceClass,
          is_active: true,
        })
      );
      await loadCategories();
      setForm((prev) => ({ ...prev, customer_category_id: String(created.id ?? "") }));
      setNewCategoryCode("");
      setNewCategoryName("");
      setNewCategoryType("B2B");
      setNewCategoryPriceClass("A");
      setAddCategoryOpen(false);
      toast.success(`Customer category added: ${String(created.name ?? newCategoryName.trim())}`);
    } catch (error) {
      toast.error(`Category create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setCreatingCategory(false);
    }
  }

  async function saveScheme() {
    if (!canWriteSchemes) {
      return;
    }
    if (!form.scheme_name.trim()) {
      toast.error("Scheme name is required.");
      return;
    }
    if (!form.customer_category_id) {
      toast.error("Customer category is required.");
      return;
    }
    if (!form.threshold_value || Number(form.threshold_value) <= 0) {
      toast.error("Enter a valid threshold value.");
      return;
    }
    if (form.reward_type === "DISCOUNT" && (!form.reward_discount_percent || Number(form.reward_discount_percent) <= 0)) {
      toast.error("Enter a valid discount percentage.");
      return;
    }
    if (form.reward_type === "FREE_ITEM" && (!form.reward_product_id || !form.reward_product_quantity || Number(form.reward_product_quantity) <= 0)) {
      toast.error("Select a free item and quantity.");
      return;
    }

    setCreating(true);
    setFeedback("");
    try {
      const payload = {
        scheme_name: form.scheme_name.trim(),
        customer_category_id: form.customer_category_id,
        condition_basis: form.condition_basis,
        threshold_value: Number(form.threshold_value),
        threshold_unit: form.threshold_unit,
        brand: form.brand || null,
        category: form.category || null,
        sub_category: form.sub_category || null,
        product_id: form.product_id || null,
        reward_type: form.reward_type,
        reward_discount_percent: form.reward_type === "DISCOUNT" ? Number(form.reward_discount_percent) : null,
        reward_product_id: form.reward_type === "FREE_ITEM" ? form.reward_product_id : null,
        reward_product_quantity: form.reward_type === "FREE_ITEM" ? Number(form.reward_product_quantity) : null,
        note: form.note.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
        is_active: form.is_active,
      };
      if (editingId) {
        await patchBackend(`/schemes/${editingId}`, payload);
      } else {
        await postBackend("/schemes", payload);
      }
      toast.success(editingId ? "Scheme updated." : "Scheme created.");
      setCreateOpen(false);
      setEditingId(null);
      setForm({ ...EMPTY_FORM });
      setRewardProductSearch("");
      setPersistedUiState({ ...defaultSchemesUiState });
      await loadSchemes();
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  function openCreateDialog() {
    if (!canWriteSchemes) {
      return;
    }
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setRewardProductSearch("");
    setCreateOpen(true);
  }

  function openEditDialog(row: SchemeRow) {
    if (!canWriteSchemes) {
      return;
    }
    setEditingId(row.id);
    setForm(toFormFromRow(row));
    setRewardProductSearch(row.reward_product_name || "");
    setCreateOpen(true);
  }

  async function toggleSchemeStatus(row: SchemeRow) {
    if (!canWriteSchemes) {
      return;
    }
    try {
      await patchBackend(`/schemes/${row.id}`, { is_active: !row.is_active });
      toast.success(`Scheme ${row.is_active ? "deactivated" : "activated"}.`);
      await loadSchemes();
    } catch (error) {
      toast.error(`Status update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  async function removeScheme(row: SchemeRow) {
    if (!canWriteSchemes) {
      return;
    }
    const confirmed = window.confirm(`Delete scheme "${row.scheme_name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }
    try {
      await deleteBackend(`/schemes/${row.id}`);
      toast.success("Scheme deleted.");
      await loadSchemes();
    } catch (error) {
      toast.error(`Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Schemes</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Apply customer-category-specific discount or free-item rules on value, weight, or quantity thresholds.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => setCreateOpen(canWriteSchemes ? open : false)}>
            {canWriteSchemes ? (
              <DialogTrigger asChild>
                <Button onClick={openCreateDialog}>Add Scheme</Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="!w-[92vw] !max-w-4xl overflow-y-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>{editingId ? "Edit Scheme" : "Create Scheme"}</DialogTitle>
                <DialogDescription>
                  Define the customer segment, threshold rule, product scope, and reward in one flow.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="scheme-name">Scheme Name *</Label>
                    <Input
                      id="scheme-name"
                      value={form.scheme_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, scheme_name: e.target.value }))}
                      placeholder="Example: B2B Dabur Value Scheme"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                </div>

                <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="scheme-category">Customer Category *</Label>
                    <select
                      id="scheme-category"
                      value={form.customer_category_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, customer_category_id: e.target.value }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">{categories.length ? "Select customer category" : "No customer categories available"}</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.customer_type} / {item.price_class})
                        </option>
                      ))}
                    </select>
                  </div>
                  <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline" disabled={!canWriteSchemes}>
                        + Add Category
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Add Customer Category</DialogTitle>
                        <DialogDescription>Create the category here, then continue creating the scheme.</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="new-scheme-category-code">Code *</Label>
                          <Input
                            id="new-scheme-category-code"
                            value={newCategoryCode}
                            onChange={(e) => setNewCategoryCode(e.target.value)}
                            placeholder="DIST"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-scheme-category-name">Name *</Label>
                          <Input
                            id="new-scheme-category-name"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Distributor"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-scheme-category-type">Customer Type *</Label>
                          <select
                            id="new-scheme-category-type"
                            value={newCategoryType}
                            onChange={(e) => setNewCategoryType((e.target.value as CustomerType) || "B2B")}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="B2B">B2B</option>
                            <option value="B2C">B2C</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="new-scheme-price-class">Price Class *</Label>
                          <select
                            id="new-scheme-price-class"
                            value={newCategoryPriceClass}
                            onChange={(e) => setNewCategoryPriceClass((e.target.value as "A" | "B" | "C") || "A")}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                          </select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setAddCategoryOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="button" onClick={createInlineCategory} disabled={!canWriteSchemes || creatingCategory}>
                          {creatingCategory ? "Adding..." : "Add Category"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="scheme-basis">Condition Basis *</Label>
                    <select
                      id="scheme-basis"
                      value={form.condition_basis}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          condition_basis: (e.target.value as ConditionBasis) || "VALUE",
                        }))
                      }
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="VALUE">Value (INR)</option>
                      <option value="WEIGHT">Weight (GM / KG)</option>
                      <option value="QUANTITY">Quantity (Pieces)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheme-threshold">Threshold Value *</Label>
                    <Input
                      id="scheme-threshold"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.threshold_value}
                      onChange={(e) => setForm((prev) => ({ ...prev, threshold_value: e.target.value }))}
                      placeholder="Enter threshold"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheme-threshold-unit">Threshold Unit *</Label>
                    <select
                      id="scheme-threshold-unit"
                      value={form.threshold_unit}
                      onChange={(e) => setForm((prev) => ({ ...prev, threshold_unit: (e.target.value as ThresholdUnit) || "INR" }))}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      {thresholdUnitOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h4 className="font-medium">Scope</h4>
                    <p className="text-sm text-muted-foreground">
                      Narrow the scheme step by step. Leave later fields empty to apply the scheme more broadly.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="scheme-brand">Brand</Label>
                      <select
                        id="scheme-brand"
                        value={form.brand}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            brand: e.target.value,
                            category: "",
                            sub_category: "",
                            product_id: "",
                          }))
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">All brands</option>
                        {brands.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scheme-category-scope">Category</Label>
                      <select
                        id="scheme-category-scope"
                        value={form.category}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            category: e.target.value,
                            sub_category: "",
                            product_id: "",
                          }))
                        }
                        disabled={!form.brand}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">{form.brand ? "All categories in brand" : "Select brand first"}</option>
                        {categoryOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scheme-subcategory">Sub Category</Label>
                      <select
                        id="scheme-subcategory"
                        value={form.sub_category}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            sub_category: e.target.value,
                            product_id: "",
                          }))
                        }
                        disabled={!form.category}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">{form.category ? "All sub-categories in category" : "Select category first"}</option>
                        {subCategoryOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="scheme-product">Product</Label>
                      <select
                        id="scheme-product"
                        value={form.product_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, product_id: e.target.value }))}
                        disabled={!form.sub_category}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="">{form.sub_category ? "Entire selected sub-category" : "Select sub-category first"}</option>
                        {scopeProducts.map((item) => (
                          <option key={item.id} value={item.id}>
                            {(item.display_name || item.name) + (item.sku ? ` (${item.sku})` : "")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border p-4">
                  <div>
                    <h4 className="font-medium">Reward</h4>
                    <p className="text-sm text-muted-foreground">Choose either a percentage discount or a free item reward.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="scheme-reward-type">Reward Type *</Label>
                      <select
                        id="scheme-reward-type"
                        value={form.reward_type}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            reward_type: (e.target.value as RewardType) || "DISCOUNT",
                            reward_discount_percent: "",
                            reward_product_id: "",
                            reward_product_quantity: "",
                          }))
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="DISCOUNT">Discount</option>
                        <option value="FREE_ITEM">Free Item</option>
                      </select>
                    </div>

                    {form.reward_type === "DISCOUNT" ? (
                      <div className="space-y-2">
                        <Label htmlFor="scheme-discount">Discount Percent *</Label>
                        <Input
                          id="scheme-discount"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={form.reward_discount_percent}
                          onChange={(e) => setForm((prev) => ({ ...prev, reward_discount_percent: e.target.value }))}
                          placeholder="10"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label htmlFor="scheme-reward-qty">Free Quantity *</Label>
                        <Input
                          id="scheme-reward-qty"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.reward_product_quantity}
                          onChange={(e) => setForm((prev) => ({ ...prev, reward_product_quantity: e.target.value }))}
                          placeholder="1"
                        />
                      </div>
                    )}
                  </div>

                  {form.reward_type === "FREE_ITEM" ? (
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="space-y-2">
                        <Label htmlFor="scheme-free-search">Free Item Search</Label>
                        <Input
                          id="scheme-free-search"
                          value={rewardProductSearch}
                          onChange={(e) => setRewardProductSearch(e.target.value)}
                          placeholder="Search product by SKU, name, brand"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="scheme-free-product">Free Item *</Label>
                        <select
                          id="scheme-free-product"
                          value={form.reward_product_id}
                          onChange={(e) => setForm((prev) => ({ ...prev, reward_product_id: e.target.value }))}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">{rewardProductOptions.length ? "Select free product" : "No products available"}</option>
                          {rewardProductOptions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {(item.display_name || item.name) + (item.sku ? ` (${item.sku})` : "")}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="scheme-start">Start Date *</Label>
                    <Input
                      id="scheme-start"
                      type="date"
                      value={form.start_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="scheme-end">End Date *</Label>
                    <Input
                      id="scheme-end"
                      type="date"
                      value={form.end_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, end_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                  {buildApplicabilityLabel(form, categories)}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="scheme-note">Internal Note</Label>
                  <Textarea
                    id="scheme-note"
                    value={form.note}
                    onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="Optional explanation for the client or operations team"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false);
                    setEditingId(null);
                    setForm({ ...EMPTY_FORM });
                    setRewardProductSearch("");
                    setPersistedUiState({ ...defaultSchemesUiState });
                  }}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={saveScheme} disabled={!canWriteSchemes || creating}>
                  {creating ? (editingId ? "Saving..." : "Creating...") : editingId ? "Save Scheme" : "Create Scheme"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing Schemes</CardTitle>
        </CardHeader>
        <CardContent>
          {permissionsLoaded && !canReadSchemes ? (
            <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              You have no schemes module access.
            </p>
          ) : null}
          {permissionsLoaded && canReadSchemes && !canWriteSchemes ? (
            <p className="mb-4 rounded-md border/30 px-3 py-2 text-sm text-muted-foreground">
              Read-only access. Create, edit, activate, and delete actions are hidden.
            </p>
          ) : null}
          {feedback ? <p className="mb-4 text-sm text-destructive">{feedback}</p> : null}
          <div className="mb-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search scheme, brand, category, sub-category"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter((e.target.value as "ALL" | "ACTIVE" | "INACTIVE") || "ALL")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="ALL">All schemes</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </select>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheme</TableHead>
                  <TableHead>Customer Category</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading
                  ? Array.from({ length: 4 }).map((_, index) => (
                      <TableRow key={`scheme-skeleton-${index}`}>
                        {Array.from({ length: 8 }).map((__, cellIndex) => (
                          <TableCell key={`scheme-skeleton-${index}-${cellIndex}`}>
                            <Skeleton className="h-5 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : rows.length > 0
                    ? rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.scheme_name}</TableCell>
                          <TableCell>{row.customer_category_name}</TableCell>
                          <TableCell>{`${row.condition_basis}: ${row.threshold_value} ${row.threshold_unit}`}</TableCell>
                          <TableCell>{formatScope(row)}</TableCell>
                          <TableCell>{formatReward(row)}</TableCell>
                          <TableCell>{`${row.start_date || "-"} to ${row.end_date || "-"}`}</TableCell>
                          <TableCell>{row.is_active ? "Active" : "Inactive"}</TableCell>
                          <TableCell className="text-right">
                            {canWriteSchemes ? (
                              <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => openEditDialog(row)}>
                                  Edit
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => void toggleSchemeStatus(row)}>
                                  {row.is_active ? "Deactivate" : "Activate"}
                                </Button>
                                <Button type="button" variant="outline" size="sm" onClick={() => void removeScheme(row)}>
                                  Delete
                                </Button>
                              </div>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                            No schemes created yet.
                          </TableCell>
                        </TableRow>
                      )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
