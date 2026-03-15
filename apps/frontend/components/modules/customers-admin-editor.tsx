"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, fetchPortalMe, patchBackend, postBackend, postBackendForm } from "@/lib/backend-api";
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

type CustomerType = "B2B" | "B2C";

type CustomerRow = {
  id: string;
  name: string;
  username: string;
  password: string;
  outlet_name: string;
  customer_type: CustomerType;
  customer_category_id: string;
  category_name: string;
  account_category_id: string;
  account_category_name: string;
  whatsapp_number: string;
  alternate_number: string;
  gst_number: string;
  pan_number: string;
  email: string;
  street_address_1: string;
  street_address_2: string;
  city: string;
  state: string;
  pincode: string;
  credit_limit: string;
  latitude: string;
  longitude: string;
  is_line_sale_outlet: boolean;
  is_active: boolean;
};

type CustomerCategory = {
  id: string;
  name: string;
  customer_type: CustomerType;
  price_class: "A" | "B" | "C";
};

type AccountCategory = {
  id: string;
  code: string;
  name: string;
};

const DEFAULT_PAGE_SIZE = 50;

function mapCustomerRow(row: Record<string, unknown>): CustomerRow {
  const category = asObject(row.customer_category);
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    username: String(row.username ?? ""),
    password: "",
    outlet_name: String(row.outlet_name ?? ""),
    customer_type: (String(row.customer_type ?? "B2C") === "B2B" ? "B2B" : "B2C") as CustomerType,
    customer_category_id: String(row.customer_category_id ?? ""),
    category_name: String(row.category_name ?? category.name ?? "-"),
    account_category_id: String(row.account_category_id ?? ""),
    account_category_name: String(row.account_category_name ?? ""),
    whatsapp_number: String(row.whatsapp_number ?? row.phone ?? ""),
    alternate_number: String(row.alternate_number ?? ""),
    gst_number: String(row.gst_number ?? row.gstin ?? ""),
    pan_number: String(row.pan_number ?? ""),
    email: String(row.email ?? ""),
    street_address_1: String(row.street_address_1 ?? ""),
    street_address_2: String(row.street_address_2 ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    pincode: String(row.pincode ?? ""),
    credit_limit: String(row.credit_limit ?? "0"),
    latitude: String(row.latitude ?? ""),
    longitude: String(row.longitude ?? ""),
    is_line_sale_outlet: Boolean(row.is_line_sale_outlet ?? false),
    is_active: Boolean(row.is_active ?? true),
  };
}

function mapCustomerCategory(row: Record<string, unknown>): CustomerCategory {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    customer_type: (String(row.customer_type ?? "B2C") === "B2B" ? "B2B" : "B2C") as CustomerType,
    price_class: (String(row.price_class ?? "C") === "B" ? "B" : String(row.price_class ?? "C") === "A" ? "A" : "C") as
      | "A"
      | "B"
      | "C",
  };
}

export function CustomersAdminEditor() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadCustomers, setCanReadCustomers] = useState(false);
  const [canWriteCustomers, setCanWriteCustomers] = useState(false);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [openAddDialog, setOpenAddDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [categories, setCategories] = useState<CustomerCategory[]>([]);
  const [accountCategories, setAccountCategories] = useState<AccountCategory[]>([]);
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [creatingCategoryInline, setCreatingCategoryInline] = useState(false);
  const [newCategoryCode, setNewCategoryCode] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryType, setNewCategoryType] = useState<CustomerType>("B2B");
  const [newCategoryPriceClass, setNewCategoryPriceClass] = useState<"A" | "B" | "C">("A");
  const [openAccountCategoryDialog, setOpenAccountCategoryDialog] = useState(false);
  const [creatingAccountCategoryInline, setCreatingAccountCategoryInline] = useState(false);
  const [newAccountCategoryCode, setNewAccountCategoryCode] = useState("");
  const [newAccountCategoryName, setNewAccountCategoryName] = useState("");
  const [newAccountCategoryDescription, setNewAccountCategoryDescription] = useState("");
  const [gstPdfFile, setGstPdfFile] = useState<File | null>(null);
  const [panPdfFile, setPanPdfFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "customers-admin",
    1,
    DEFAULT_PAGE_SIZE
  );

  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    outlet_name: "",
    customer_category_id: "",
    account_category_id: "",
    whatsapp_number: "",
    alternate_number: "",
    gst_number: "",
    pan_number: "",
    credit_limit: "0",
    email: "",
    street_address_1: "",
    street_address_2: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
    is_line_sale_outlet: false,
  });

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return rows;
    }
    return rows.filter((row) => {
      return (
        row.name.toLowerCase().includes(query) ||
        row.outlet_name.toLowerCase().includes(query) ||
        row.whatsapp_number.toLowerCase().includes(query) ||
        row.category_name.toLowerCase().includes(query)
      );
    });
  }, [rows, search]);

  async function loadCategories() {
    if (!canReadCustomers) {
      return;
    }
    try {
      const res = asObject(await fetchBackend("/masters/customer-categories?page=1&page_size=100"));
      setCategories(asArray(res.items).map(mapCustomerCategory));
    } catch {
      setCategories([]);
    }
  }

  async function loadAccountCategories() {
    if (!canReadCustomers) {
      return;
    }
    try {
      const res = asObject(await fetchBackend("/masters/account-categories?party_type=CUSTOMER&page=1&page_size=100"));
      setAccountCategories(
        asArray(res.items).map((row) => ({
          id: String(row.id ?? ""),
          code: String(row.code ?? ""),
          name: String(row.name ?? ""),
        }))
      );
    } catch {
      setAccountCategories([]);
    }
  }

  async function createInlineCategory() {
    if (!canWriteCustomers) {
      return;
    }
    if (!newCategoryCode.trim() || !newCategoryName.trim()) {
      toast.error("Category code and name are required.", { duration: 4000 });
      return;
    }

    setCreatingCategoryInline(true);
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
      setOpenCategoryDialog(false);
      setNewCategoryCode("");
      setNewCategoryName("");
      setNewCategoryType("B2B");
      setNewCategoryPriceClass("A");
      toast.success(`Customer category added: ${String(created.name ?? newCategoryName.trim())}`, { duration: 4000 });
    } catch (error) {
      toast.error(`Category create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingCategoryInline(false);
    }
  }

  async function createInlineAccountCategory() {
    if (!canWriteCustomers) {
      return;
    }
    if (!newAccountCategoryCode.trim() || !newAccountCategoryName.trim()) {
      toast.error("Account category code and name are required.", { duration: 4000 });
      return;
    }
    setCreatingAccountCategoryInline(true);
    try {
      const created = asObject(
        await postBackend("/masters/account-categories", {
          code: newAccountCategoryCode.trim(),
          name: newAccountCategoryName.trim(),
          party_type: "CUSTOMER",
          description: newAccountCategoryDescription.trim() || null,
          is_active: true,
        })
      );
      await loadAccountCategories();
      setForm((prev) => ({ ...prev, account_category_id: String(created.id ?? "") }));
      setOpenAccountCategoryDialog(false);
      setNewAccountCategoryCode("");
      setNewAccountCategoryName("");
      setNewAccountCategoryDescription("");
      toast.success(`Account category added: ${String(created.name ?? newAccountCategoryName.trim())}`, { duration: 4000 });
    } catch (error) {
      toast.error(`Account category create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingAccountCategoryInline(false);
    }
  }

  async function loadCustomers(page: number, pageSizeValue = pageSize) {
    if (!canReadCustomers) {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setRows([]);
    setFeedback("");
    try {
      const response = asObject(await fetchBackend(`/masters/customers?page=${page}&page_size=${pageSizeValue}`));
      setRows(asArray(response.items).map(mapCustomerRow));
      setCurrentPage(Number(response.page ?? page));
      setTotalPages(Number(response.total_pages ?? 0));
      setTotalCount(Number(response.total ?? 0));
      setSelectedIds([]);
      setOpenId(null);
    } catch (error) {
      setRows([]);
      setTotalPages(0);
      setTotalCount(0);
      resetPage();
      const message = `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = asObject(await fetchPortalMe());
        const isSuperAdmin = Boolean(payload.is_super_admin);
        const permission = asObject(asObject(payload.admin_permissions).customers);
        if (!active) {
          return;
        }
        setCanReadCustomers(isSuperAdmin || Boolean(permission.read) || Boolean(permission.write));
        setCanWriteCustomers(isSuperAdmin || Boolean(permission.write));
        setPermissionsLoaded(true);
      } catch {
        if (!active) {
          return;
        }
        setCanReadCustomers(false);
        setCanWriteCustomers(false);
        setPermissionsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!permissionsLoaded || !canReadCustomers) {
      return;
    }
    void loadCategories();
    void loadAccountCategories();
  }, [permissionsLoaded, canReadCustomers]);

  useEffect(() => {
    if (!permissionsLoaded || !canReadCustomers) {
      setLoading(false);
      return;
    }
    void loadCustomers(currentPage, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, permissionsLoaded, canReadCustomers]);

  const categoryOptions = useMemo(() => {
    return categories.map((item) => ({
      value: item.id,
      label: `${item.name} (${item.customer_type} / ${item.price_class})`,
    }));
  }, [categories]);

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  function updateSelected(field: keyof CustomerRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function saveSelected() {
    if (!canWriteCustomers) {
      return;
    }
    if (!selected) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/customers/${selected.id}`, {
        name: selected.name.trim(),
        username: selected.username.trim() || null,
        password: selected.password.trim() || null,
        outlet_name: selected.outlet_name.trim() || null,
        customer_category_id: selected.customer_category_id || null,
        account_category_id: selected.account_category_id || null,
        whatsapp_number: selected.whatsapp_number.trim() || null,
        alternate_number: selected.alternate_number.trim() || null,
        gst_number: selected.gst_number.trim() || null,
        pan_number: selected.pan_number.trim() || null,
        email: selected.email.trim() || null,
        street_address_1: selected.street_address_1.trim() || null,
        street_address_2: selected.street_address_2.trim() || null,
        city: selected.city.trim() || null,
        state: selected.state.trim() || null,
        pincode: selected.pincode.trim() || null,
        credit_limit: Number(selected.credit_limit || "0"),
        latitude: selected.latitude.trim() ? Number(selected.latitude) : null,
        longitude: selected.longitude.trim() ? Number(selected.longitude) : null,
        is_line_sale_outlet: selected.is_line_sale_outlet,
        is_active: selected.is_active,
      });
      toast.success(`Customer updated: ${selected.name}`, { duration: 5000 });
      setFeedback(`Customer updated: ${selected.name}`);
      setOpenId(null);
      await loadCustomers(currentPage, pageSize);
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteSelected() {
    if (!canWriteCustomers) {
      return;
    }
    if (!selectedIds.length || loading) {
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.length} selected customer(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/customers/${id}`)));
      toast.success(`Deleted ${selectedIds.length} customer(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} customer(s).`);
      await loadCustomers(currentPage, pageSize);
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  async function createCustomer() {
    if (!canWriteCustomers) {
      return;
    }
    if (!form.name.trim()) {
      toast.error("Customer name is required.", { duration: 4000 });
      return;
    }

    setCreating(true);
    setFeedback("");
    try {
      let gstDocPath: string | null = null;
      let panDocPath: string | null = null;

      if (gstPdfFile) {
        const payload = new FormData();
        payload.append("file", gstPdfFile);
        const response = asObject(
          await postBackendForm("/masters/customer-documents/upload?doc_type=gst_doc", payload)
        );
        gstDocPath = String(response.path ?? "");
      }

      if (panPdfFile) {
        const payload = new FormData();
        payload.append("file", panPdfFile);
        const response = asObject(
          await postBackendForm("/masters/customer-documents/upload?doc_type=pan_doc", payload)
        );
        panDocPath = String(response.path ?? "");
      }

      await postBackend("/masters/customers", {
        name: form.name.trim(),
        username: form.username.trim() || null,
        password: form.password.trim() || null,
        outlet_name: form.outlet_name.trim() || null,
        customer_category_id: form.customer_category_id || null,
        account_category_id: form.account_category_id || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        alternate_number: form.alternate_number.trim() || null,
        gst_number: form.gst_number.trim() || null,
        gst_doc: gstDocPath || null,
        pan_number: form.pan_number.trim() || null,
        pan_doc: panDocPath || null,
        email: form.email.trim() || null,
        street_address_1: form.street_address_1.trim() || null,
        street_address_2: form.street_address_2.trim() || null,
        city: form.city.trim() || null,
        state: form.state.trim() || null,
        pincode: form.pincode.trim() || null,
        credit_limit: Number(form.credit_limit || "0"),
        latitude: form.latitude.trim() ? Number(form.latitude) : null,
        longitude: form.longitude.trim() ? Number(form.longitude) : null,
        is_line_sale_outlet: form.is_line_sale_outlet,
      });

      toast.success("Customer created.", { duration: 5000 });
      setFeedback("Customer created.");
      setOpenAddDialog(false);
      setForm({
        name: "",
        username: "",
        password: "",
        outlet_name: "",
        customer_category_id: "",
        account_category_id: "",
        whatsapp_number: "",
        alternate_number: "",
        gst_number: "",
        pan_number: "",
        credit_limit: "0",
        email: "",
        street_address_1: "",
        street_address_2: "",
        city: "",
        state: "",
        pincode: "",
        latitude: "",
        longitude: "",
        is_line_sale_outlet: false,
      });
      setGstPdfFile(null);
      setPanPdfFile(null);
      resetPage();
      await loadCustomers(1, pageSize);
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Customers (Editable)</CardTitle>
          <div className="flex items-center gap-2">
            {canWriteCustomers ? (
              <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
                Delete Selected
              </Button>
            ) : null}
            <Dialog open={openAddDialog} onOpenChange={(open) => setOpenAddDialog(canWriteCustomers ? open : false)}>
              {canWriteCustomers ? (
                <DialogTrigger asChild>
                  <Button>Add Customer</Button>
                </DialogTrigger>
              ) : null}
              <DialogContent className="max-h-[85vh] w-[92vw] max-w-[900px] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Customer</DialogTitle>
                  <DialogDescription>Add a customer record from the customer master schema.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Name *</Label>
                    <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Username</Label>
                    <Input
                      value={form.username}
                      onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                      placeholder="Auto-generated if empty"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                      placeholder="Defaults to ChangeMe@123"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Outlet Name</Label>
                    <Input
                      value={form.outlet_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, outlet_name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Customer Category</Label>
                      <Dialog open={openCategoryDialog} onOpenChange={(open) => setOpenCategoryDialog(canWriteCustomers ? open : false)}>
                        <DialogTrigger asChild>
                          <Button size="sm" type="button" variant="outline" disabled={!canWriteCustomers}>+ Add Category</Button>
                        </DialogTrigger>
                        <DialogContent className="w-[92vw] max-w-[520px]">
                          <DialogHeader>
                            <DialogTitle>Add Customer Category</DialogTitle>
                            <DialogDescription>Create a category without leaving customer creation.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label>Code *</Label>
                              <Input value={newCategoryCode} onChange={(e) => setNewCategoryCode(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Name *</Label>
                              <Input value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Customer Type *</Label>
                              <select
                                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                                value={newCategoryType}
                                onChange={(e) => setNewCategoryType((e.target.value === "B2B" ? "B2B" : "B2C") as CustomerType)}
                              >
                                <option value="B2B">B2B</option>
                                <option value="B2C">B2C</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label>Price Class *</Label>
                              <select
                                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                                value={newCategoryPriceClass}
                                onChange={(e) =>
                                  setNewCategoryPriceClass(
                                    (e.target.value === "B" ? "B" : e.target.value === "C" ? "C" : "A") as "A" | "B" | "C"
                                  )
                                }
                              >
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                              </select>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpenCategoryDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={createInlineCategory}
                              disabled={creatingCategoryInline || !newCategoryCode.trim() || !newCategoryName.trim()}
                            >
                              {creatingCategoryInline ? "Adding..." : "Add Category"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <select
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                      value={form.customer_category_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, customer_category_id: e.target.value }))}
                    >
                      <option value="">Select category</option>
                      {categoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label>Account Category</Label>
                      <Dialog open={openAccountCategoryDialog} onOpenChange={(open) => setOpenAccountCategoryDialog(canWriteCustomers ? open : false)}>
                        <DialogTrigger asChild>
                          <Button size="sm" type="button" variant="outline" disabled={!canWriteCustomers}>+ Add Account Category</Button>
                        </DialogTrigger>
                        <DialogContent className="w-[92vw] max-w-[520px]">
                          <DialogHeader>
                            <DialogTitle>Add Customer Account Category</DialogTitle>
                            <DialogDescription>Create an account category without leaving customer creation.</DialogDescription>
                          </DialogHeader>
                          <div className="grid gap-3">
                            <div className="space-y-1">
                              <Label>Code *</Label>
                              <Input value={newAccountCategoryCode} onChange={(e) => setNewAccountCategoryCode(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Name *</Label>
                              <Input value={newAccountCategoryName} onChange={(e) => setNewAccountCategoryName(e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Description</Label>
                              <Input
                                value={newAccountCategoryDescription}
                                onChange={(e) => setNewAccountCategoryDescription(e.target.value)}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpenAccountCategoryDialog(false)}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={createInlineAccountCategory}
                              disabled={
                                creatingAccountCategoryInline || !newAccountCategoryCode.trim() || !newAccountCategoryName.trim()
                              }
                            >
                              {creatingAccountCategoryInline ? "Adding..." : "Add Account Category"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                    <select
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                      value={form.account_category_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, account_category_id: e.target.value }))}
                    >
                      <option value="">Select account category</option>
                      {accountCategories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} ({category.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>WhatsApp Number</Label>
                    <Input
                      value={form.whatsapp_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, whatsapp_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Alternate Number</Label>
                    <Input
                      value={form.alternate_number}
                      onChange={(e) => setForm((prev) => ({ ...prev, alternate_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>GST Number</Label>
                    <Input value={form.gst_number} onChange={(e) => setForm((prev) => ({ ...prev, gst_number: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>GST PDF (Optional)</Label>
                    <Input
                      type="file"
                      accept="application/pdf"
                      disabled={creating}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) {
                          setGstPdfFile(null);
                          return;
                        }
                        if (file.type !== "application/pdf") {
                          toast.error("Only PDF files are allowed.");
                          e.currentTarget.value = "";
                          return;
                        }
                        setGstPdfFile(file);
                      }}
                    />
                    {gstPdfFile ? <p className="text-xs text-muted-foreground">{gstPdfFile.name}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <Label>PAN Number</Label>
                    <Input value={form.pan_number} onChange={(e) => setForm((prev) => ({ ...prev, pan_number: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>PAN PDF (Optional)</Label>
                    <Input
                      type="file"
                      accept="application/pdf"
                      disabled={creating}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) {
                          setPanPdfFile(null);
                          return;
                        }
                        if (file.type !== "application/pdf") {
                          toast.error("Only PDF files are allowed.");
                          e.currentTarget.value = "";
                          return;
                        }
                        setPanPdfFile(file);
                      }}
                    />
                    {panPdfFile ? <p className="text-xs text-muted-foreground">{panPdfFile.name}</p> : null}
                  </div>
                  <div className="space-y-1">
                    <Label>Email</Label>
                    <Input value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Street Address 1</Label>
                    <Input
                      value={form.street_address_1}
                      onChange={(e) => setForm((prev) => ({ ...prev, street_address_1: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <Label>Street Address 2</Label>
                    <Input
                      value={form.street_address_2}
                      onChange={(e) => setForm((prev) => ({ ...prev, street_address_2: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>City</Label>
                    <Input value={form.city} onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>State</Label>
                    <Input value={form.state} onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Pincode</Label>
                    <Input value={form.pincode} onChange={(e) => setForm((prev) => ({ ...prev, pincode: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input
                      type="number"
                      step="0.0000001"
                      value={form.latitude}
                      onChange={(e) => setForm((prev) => ({ ...prev, latitude: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input
                      type="number"
                      step="0.0000001"
                      value={form.longitude}
                      onChange={(e) => setForm((prev) => ({ ...prev, longitude: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Credit Limit</Label>
                    <Input
                      type="number"
                      value={form.credit_limit}
                      onChange={(e) => setForm((prev) => ({ ...prev, credit_limit: e.target.value }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 pt-7">
                    <input
                      type="checkbox"
                      checked={form.is_line_sale_outlet}
                      onChange={(e) => setForm((prev) => ({ ...prev, is_line_sale_outlet: e.target.checked }))}
                    />
                    Line Sale Outlet
                  </label>
                </div>

                <DialogFooter>
                  <Button onClick={createCustomer} disabled={!canWriteCustomers || creating || !form.name.trim()}>
                    {creating ? "Creating..." : "Create Customer"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {permissionsLoaded && !canReadCustomers ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You have no customers module access.
          </p>
        ) : null}
        {permissionsLoaded && canReadCustomers && !canWriteCustomers ? (
          <p className="rounded-md border/30 px-3 py-2 text-sm text-muted-foreground">
            Read-only access. Create, edit, and delete actions are hidden.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search name, outlet, whatsapp, category"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (value.trim() === "" && search !== "") {
                setSearch("");
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSearch(searchInput.trim());
              }
            }}
          />
          <Button onClick={() => setSearch(searchInput.trim())} disabled={loading}>
            Search
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setSearchInput("");
              setSearch("");
            }}
          >
            Reset
          </Button>
        </div>

        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
                <TableHead className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
                </TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Name</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Outlet</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Type</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Category</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Account Category</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">WhatsApp</TableHead>
                <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Credit Limit</TableHead>
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
                      <TableCell><Skeleton className="h-5 w-40 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-48 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-14 dark:h-5" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                    </TableRow>
                  ))
                : null}

              {!loading && filteredRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    No customers found.
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading
                ? filteredRows.map((row, index) => (
                    <TableRow key={row.id || `${row.name}-${index}`} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(e) => toggleSelectOne(row.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>{row.name || "-"}</TableCell>
                      <TableCell>{row.outlet_name || "-"}</TableCell>
                      <TableCell>{row.customer_type}</TableCell>
                      <TableCell>{row.category_name || "-"}</TableCell>
                      <TableCell>{row.account_category_name || "-"}</TableCell>
                      <TableCell>{row.whatsapp_number || "-"}</TableCell>
                      <TableCell>{row.credit_limit}</TableCell>
                      <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                      <TableCell>
                        <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(canWriteCustomers && open ? row.id : null)}>
                          {canWriteCustomers ? (
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline">Edit</Button>
                            </DialogTrigger>
                          ) : null}
                          <DialogContent className="max-h-[85vh] w-[92vw] max-w-[900px] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>Edit Customer</DialogTitle>
                              <DialogDescription>Update selected customer details.</DialogDescription>
                            </DialogHeader>
                            {selected && selected.id === row.id ? (
                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-1">
                                  <Label>Name *</Label>
                                  <Input value={selected.name} onChange={(e) => updateSelected("name", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>Username</Label>
                                  <Input
                                    value={selected.username}
                                    onChange={(e) => updateSelected("username", e.target.value)}
                                    placeholder="Auto-generated if empty"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>New Password</Label>
                                  <Input
                                    type="password"
                                    value={selected.password}
                                    onChange={(e) => updateSelected("password", e.target.value)}
                                    placeholder="Leave blank to keep current password"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Outlet Name</Label>
                                  <Input value={selected.outlet_name} onChange={(e) => updateSelected("outlet_name", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>Customer Category</Label>
                                  <select
                                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                                    value={selected.customer_category_id}
                                    onChange={(e) => updateSelected("customer_category_id", e.target.value)}
                                  >
                                    <option value="">Select category</option>
                                    {categoryOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <Label>WhatsApp Number</Label>
                                  <Input value={selected.whatsapp_number} onChange={(e) => updateSelected("whatsapp_number", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>Account Category</Label>
                                  <select
                                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                                    value={selected.account_category_id}
                                    onChange={(e) => {
                                      const nextId = e.target.value;
                                      const nextCategory = accountCategories.find((item) => item.id === nextId);
                                      setRows((prev) =>
                                        prev.map((row) =>
                                          row.id === selected.id
                                            ? {
                                                ...row,
                                                account_category_id: nextId,
                                                account_category_name: nextCategory?.name ?? "",
                                              }
                                            : row
                                        )
                                      );
                                    }}
                                  >
                                    <option value="">Select account category</option>
                                    {accountCategories.map((category) => (
                                      <option key={category.id} value={category.id}>
                                        {category.name} ({category.code})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <Label>Alternate Number</Label>
                                  <Input value={selected.alternate_number} onChange={(e) => updateSelected("alternate_number", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>GST Number</Label>
                                  <Input value={selected.gst_number} onChange={(e) => updateSelected("gst_number", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>PAN Number</Label>
                                  <Input value={selected.pan_number} onChange={(e) => updateSelected("pan_number", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>Email</Label>
                                  <Input value={selected.email} onChange={(e) => updateSelected("email", e.target.value)} />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                  <Label>Street Address 1</Label>
                                  <Input
                                    value={selected.street_address_1}
                                    onChange={(e) => updateSelected("street_address_1", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                  <Label>Street Address 2</Label>
                                  <Input
                                    value={selected.street_address_2}
                                    onChange={(e) => updateSelected("street_address_2", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>City</Label>
                                  <Input value={selected.city} onChange={(e) => updateSelected("city", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>State</Label>
                                  <Input value={selected.state} onChange={(e) => updateSelected("state", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>Pincode</Label>
                                  <Input value={selected.pincode} onChange={(e) => updateSelected("pincode", e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                  <Label>Latitude</Label>
                                  <Input
                                    type="number"
                                    step="0.0000001"
                                    value={selected.latitude}
                                    onChange={(e) => updateSelected("latitude", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Longitude</Label>
                                  <Input
                                    type="number"
                                    step="0.0000001"
                                    value={selected.longitude}
                                    onChange={(e) => updateSelected("longitude", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Credit Limit</Label>
                                  <Input value={selected.credit_limit} onChange={(e) => updateSelected("credit_limit", e.target.value)} />
                                </div>
                                <label className="flex items-center gap-2 pt-7">
                                  <input
                                    type="checkbox"
                                    checked={selected.is_line_sale_outlet}
                                    onChange={(e) => updateSelected("is_line_sale_outlet", e.target.checked)}
                                  />
                                  Line Sale Outlet
                                </label>
                              </div>
                            ) : null}
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setOpenId(null)}>
                                Cancel
                              </Button>
                              <Button onClick={saveSelected} disabled={!canWriteCustomers || savingId === row.id || !selected?.name.trim()}>
                                {savingId === row.id ? "Saving..." : "Save"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                : null}
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
            onPrevious={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            onNext={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            onLast={() => setCurrentPage(totalPages || 1)}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
