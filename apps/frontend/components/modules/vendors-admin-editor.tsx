"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackend, fetchPortalMe, patchBackend, postBackend } from "@/lib/backend-api";
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

type VendorRow = {
  id: string;
  firm_name: string;
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
  account_category_name: string;
  is_active: boolean;
};

type AccountCategoryRow = {
  id: string;
  code: string;
  name: string;
};

const DEFAULT_PAGE_SIZE = 50;

const EMPTY_CREATE_FORM = {
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
  account_category_id: "",
};

const EMPTY_CATEGORY_FORM = {
  code: "",
  name: "",
  description: "",
};

function mapRow(row: Record<string, unknown>): VendorRow {
  return {
    id: String(row.id ?? ""),
    firm_name: String(row.firm_name ?? ""),
    gstin: String(row.gstin ?? ""),
    pan: String(row.pan ?? ""),
    owner_name: String(row.owner_name ?? ""),
    phone: String(row.phone ?? ""),
    alternate_phone: String(row.alternate_phone ?? ""),
    email: String(row.email ?? ""),
    street: String(row.street ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    pincode: String(row.pincode ?? ""),
    bank_account_number: String(row.bank_account_number ?? ""),
    ifsc_code: String(row.ifsc_code ?? ""),
    account_category_id: String(row.account_category_id ?? ""),
    account_category_name: String(row.account_category_name ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

export function VendorsAdminEditor() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadVendors, setCanReadVendors] = useState(false);
  const [canWriteVendors, setCanWriteVendors] = useState(false);
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [accountCategories, setAccountCategories] = useState<AccountCategoryRow[]>([]);
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ ...EMPTY_CATEGORY_FORM });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const { currentPage, pageSize, setCurrentPage, setPageSize, resetPage } = usePersistedPage(
    "vendors-admin",
    1,
    DEFAULT_PAGE_SIZE
  );
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = useMemo(() => rows.find((row) => row.id === openId) ?? null, [rows, openId]);

  async function loadAccountCategories() {
    if (!canReadVendors) {
      return;
    }
    try {
      const response = asObject(await fetchBackend("/masters/account-categories?party_type=VENDOR&page=1&page_size=100"));
      setAccountCategories(
        asArray(response.items).map((row) => ({
          id: String(row.id ?? ""),
          code: String(row.code ?? ""),
          name: String(row.name ?? ""),
        }))
      );
    } catch {
      setAccountCategories([]);
    }
  }

  async function load(page: number, searchText: string, pageSizeValue = pageSize) {
    if (!canReadVendors) {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setRows([]);
    setFeedback("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("page_size", String(pageSizeValue));
      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }
      const response = asObject(await fetchBackend(`/masters/vendors?${params.toString()}`));
      setRows(asArray(response.items).map(mapRow));
      setCurrentPage(Number(response.page ?? page));
      setTotalPages(Number(response.total_pages ?? 0));
      setTotalCount(Number(response.total ?? 0));
      setSelectedIds([]);
    } catch (error) {
      setRows([]);
      resetPage();
      setTotalPages(0);
      setTotalCount(0);
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
        const permission = asObject(asObject(payload.admin_permissions).vendors);
        if (!active) {
          return;
        }
        setCanReadVendors(isSuperAdmin || Boolean(permission.read) || Boolean(permission.write));
        setCanWriteVendors(isSuperAdmin || Boolean(permission.write));
        setPermissionsLoaded(true);
      } catch {
        if (!active) {
          return;
        }
        setCanReadVendors(false);
        setCanWriteVendors(false);
        setPermissionsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!permissionsLoaded || !canReadVendors) {
      return;
    }
    void loadAccountCategories();
  }, [permissionsLoaded, canReadVendors]);

  useEffect(() => {
    if (!permissionsLoaded || !canReadVendors) {
      setLoading(false);
      return;
    }
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize, permissionsLoaded, canReadVendors]);

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? rows.map((row) => row.id) : []);
  }

  function toggleSelectOne(id: string, checked: boolean) {
    setSelectedIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((item) => item !== id)));
  }

  function updateSelected(field: keyof VendorRow, value: string | boolean) {
    if (!selected) {
      return;
    }
    setRows((prev) => prev.map((row) => (row.id === selected.id ? { ...row, [field]: value } : row)));
  }

  async function saveSelected() {
    if (!canWriteVendors) {
      return;
    }
    if (!selected) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/vendors/${selected.id}`, {
        firm_name: selected.firm_name || null,
        gstin: selected.gstin || null,
        pan: selected.pan || null,
        owner_name: selected.owner_name || null,
        phone: selected.phone || null,
        alternate_phone: selected.alternate_phone || null,
        email: selected.email || null,
        street: selected.street || null,
        city: selected.city || null,
        state: selected.state || null,
        pincode: selected.pincode || null,
        bank_account_number: selected.bank_account_number || null,
        ifsc_code: selected.ifsc_code || null,
        account_category_id: selected.account_category_id || null,
        is_active: selected.is_active,
      });
      toast.success(`Vendor updated: ${selected.firm_name}`, { duration: 5000 });
      setFeedback(`Vendor updated: ${selected.firm_name}`);
      setOpenId(null);
    } catch (error) {
      const message = `Update failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setSavingId(null);
    }
  }

  async function createVendor() {
    if (!canWriteVendors) {
      return;
    }
    if (!createForm.firm_name.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/vendors", {
        firm_name: createForm.firm_name.trim(),
        gstin: createForm.gstin.trim() || null,
        pan: createForm.pan.trim() || null,
        owner_name: createForm.owner_name.trim() || null,
        phone: createForm.phone.trim() || null,
        alternate_phone: createForm.alternate_phone.trim() || null,
        email: createForm.email.trim() || null,
        street: createForm.street.trim() || null,
        city: createForm.city.trim() || null,
        state: createForm.state.trim() || null,
        pincode: createForm.pincode.trim() || null,
        bank_account_number: createForm.bank_account_number.trim() || null,
        ifsc_code: createForm.ifsc_code.trim() || null,
        account_category_id: createForm.account_category_id || null,
      });
      const createdName = createForm.firm_name.trim();
      setCreateForm({ ...EMPTY_CREATE_FORM });
      setOpenCreateDialog(false);
      resetPage();
      await load(1, search, pageSize);
      toast.success(`Vendor created: ${createdName}`, { duration: 5000 });
      setFeedback(`Vendor created: ${createdName}`);
    } catch (error) {
      const message = `Create failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setCreating(false);
    }
  }

  async function createInlineCategory() {
    if (!canWriteVendors) {
      return;
    }
    if (!categoryForm.code.trim() || !categoryForm.name.trim()) {
      toast.error("Category code and name are required.", { duration: 5000 });
      return;
    }
    setCreatingCategory(true);
    try {
      const created = asObject(
        await postBackend("/masters/account-categories", {
          code: categoryForm.code.trim(),
          name: categoryForm.name.trim(),
          party_type: "VENDOR",
          description: categoryForm.description.trim() || null,
          is_active: true,
        })
      );
      await loadAccountCategories();
      setCreateForm((prev) => ({ ...prev, account_category_id: String(created.id ?? "") }));
      setCategoryForm({ ...EMPTY_CATEGORY_FORM });
      setOpenCategoryDialog(false);
      toast.success(`Account category created: ${String(created.name ?? categoryForm.name.trim())}`, { duration: 5000 });
    } catch (error) {
      toast.error(`Category create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingCategory(false);
    }
  }

  async function deleteSelected() {
    if (!canWriteVendors) {
      return;
    }
    if (!selectedIds.length || loading) {
      return;
    }
    if (!window.confirm(`Delete ${selectedIds.length} selected vendor(s)?`)) {
      return;
    }
    setFeedback("");
    try {
      await Promise.all(selectedIds.map((id) => deleteBackend(`/masters/vendors/${id}`)));
      toast.success(`Deleted ${selectedIds.length} vendor(s).`, { duration: 5000 });
      setFeedback(`Deleted ${selectedIds.length} vendor(s).`);
      await load(currentPage, search, pageSize);
    } catch (error) {
      const message = `Delete failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendors (Editable)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {permissionsLoaded && !canReadVendors ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            You have no vendors module access.
          </p>
        ) : null}
        {permissionsLoaded && canReadVendors && !canWriteVendors ? (
          <p className="rounded-md border/30 px-3 py-2 text-sm text-muted-foreground">
            Read-only access. Create, edit, and delete actions are hidden.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input
            placeholder="Search vendor name, GSTIN, city, phone"
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value;
              setSearchInput(value);
              if (value.trim() === "" && search !== "") {
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
          {canWriteVendors ? (
            <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
              Delete Selected
            </Button>
          ) : null}
          <Dialog open={openCreateDialog} onOpenChange={(open) => setOpenCreateDialog(canWriteVendors ? open : false)}>
            {canWriteVendors ? (
              <DialogTrigger asChild>
                <Button>Add Vendor</Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add Vendor</DialogTitle>
                <DialogDescription>Create a vendor using the `VendorCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Firm Name</Label>
                  <Input value={createForm.firm_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, firm_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>GSTIN</Label>
                  <Input value={createForm.gstin} onChange={(e) => setCreateForm((prev) => ({ ...prev, gstin: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>PAN</Label>
                  <Input value={createForm.pan} onChange={(e) => setCreateForm((prev) => ({ ...prev, pan: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Owner Name</Label>
                  <Input
                    value={createForm.owner_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={createForm.phone} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Alternate Phone</Label>
                  <Input
                    value={createForm.alternate_phone}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, alternate_phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Street</Label>
                  <Input
                    value={createForm.street}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, street: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={createForm.city} onChange={(e) => setCreateForm((prev) => ({ ...prev, city: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input value={createForm.state} onChange={(e) => setCreateForm((prev) => ({ ...prev, state: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Pincode</Label>
                  <Input
                    value={createForm.pincode}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, pincode: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bank Account Number</Label>
                  <Input
                    value={createForm.bank_account_number}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, bank_account_number: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>IFSC Code</Label>
                  <Input
                    value={createForm.ifsc_code}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, ifsc_code: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Account Category</Label>
                    <Dialog open={openCategoryDialog} onOpenChange={(open) => setOpenCategoryDialog(canWriteVendors ? open : false)}>
                      <DialogTrigger asChild>
                        <Button size="sm" type="button" variant="outline" disabled={!canWriteVendors}>+ Add Account Category</Button>
                      </DialogTrigger>
                      <DialogContent className="w-[92vw] max-w-[520px]">
                        <DialogHeader>
                          <DialogTitle>Add Vendor Account Category</DialogTitle>
                          <DialogDescription>Create a vendor account category without leaving vendor creation.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3">
                          <div className="space-y-1">
                            <Label>Code *</Label>
                            <Input
                              value={categoryForm.code}
                              onChange={(e) => setCategoryForm((prev) => ({ ...prev, code: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Name *</Label>
                            <Input
                              value={categoryForm.name}
                              onChange={(e) => setCategoryForm((prev) => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Description</Label>
                            <Input
                              value={categoryForm.description}
                              onChange={(e) => setCategoryForm((prev) => ({ ...prev, description: e.target.value }))}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button type="button" variant="outline" onClick={() => setOpenCategoryDialog(false)}>
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={createInlineCategory}
                            disabled={creatingCategory || !categoryForm.code.trim() || !categoryForm.name.trim()}
                          >
                            {creatingCategory ? "Adding..." : "Add Account Category"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <select
                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    value={createForm.account_category_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, account_category_id: e.target.value }))}
                  >
                    <option value="">Select account category</option>
                    {accountCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createVendor} disabled={!canWriteVendors || creating || !createForm.firm_name.trim()}>
                  {creating ? "Creating..." : "Create Vendor"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {feedback ? <p className="rounded-md border/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[1050px]">
            <TableHeader>
            <TableRow className="bg-slate-200/70 dark:bg-slate-800/60">
              <TableHead className="w-10">
                <input type="checkbox" checked={allSelected} onChange={(e) => toggleSelectAll(e.target.checked)} />
              </TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Firm Name</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">GSTIN</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Phone</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Account Category</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">City</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">State</TableHead>
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
                    <TableCell><Skeleton className="h-5 w-44 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground">
                  No vendors found.
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              rows.map((row, index) => (
                <TableRow key={row.id} className={index % 2 === 0 ? "bg-slate-50/70 dark:bg-slate-900/30" : ""}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={(e) => toggleSelectOne(row.id, e.target.checked)}
                    />
                  </TableCell>
                  <TableCell>{row.firm_name || "-"}</TableCell>
                  <TableCell>{row.gstin || "-"}</TableCell>
                  <TableCell>{row.phone || "-"}</TableCell>
                  <TableCell>{row.account_category_name || "-"}</TableCell>
                  <TableCell>{row.city || "-"}</TableCell>
                  <TableCell>{row.state || "-"}</TableCell>
                  <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(canWriteVendors && open ? row.id : null)}>
                      {canWriteVendors ? (
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline">
                            Edit
                          </Button>
                        </DialogTrigger>
                      ) : null}
                      <DialogContent className="max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Vendor</DialogTitle>
                          <DialogDescription>Update vendor fields and save.</DialogDescription>
                        </DialogHeader>
                        {selected ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1 md:col-span-2">
                              <Label>Firm Name</Label>
                              <Input value={selected.firm_name} onChange={(e) => updateSelected("firm_name", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>GSTIN</Label>
                              <Input value={selected.gstin} onChange={(e) => updateSelected("gstin", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>PAN</Label>
                              <Input value={selected.pan} onChange={(e) => updateSelected("pan", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Owner Name</Label>
                              <Input value={selected.owner_name} onChange={(e) => updateSelected("owner_name", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Phone</Label>
                              <Input value={selected.phone} onChange={(e) => updateSelected("phone", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Alternate Phone</Label>
                              <Input
                                value={selected.alternate_phone}
                                onChange={(e) => updateSelected("alternate_phone", e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Email</Label>
                              <Input value={selected.email} onChange={(e) => updateSelected("email", e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label>Street</Label>
                              <Input value={selected.street} onChange={(e) => updateSelected("street", e.target.value)} />
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
                              <Label>Bank Account Number</Label>
                              <Input
                                value={selected.bank_account_number}
                                onChange={(e) => updateSelected("bank_account_number", e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>IFSC Code</Label>
                              <Input value={selected.ifsc_code} onChange={(e) => updateSelected("ifsc_code", e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
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
                          <Button onClick={saveSelected} disabled={!canWriteVendors || !selected || savingId === selected.id}>
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
          onFirst={() => setCurrentPage(1)}
          onPrevious={() => setCurrentPage((p) => p - 1)}
          onNext={() => setCurrentPage((p) => p + 1)}
          onLast={() => setCurrentPage(totalPages)}
        />
      </CardContent>
    </Card>
  );
}
