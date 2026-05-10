"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { asArray, asObject, deleteBackend, fetchBackendFresh, fetchPortalMe, patchBackend, postBackend } from "@/lib/backend-api";
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
  brand_ids: string[];
  brand_names: string[];
  purchase_type: string;
  gstin: string;
  pan: string;
  owner_name: string;
  phone: string;
  alternate_phone: string;
  email: string;
  street: string;
  street_address_1: string;
  street_address_2: string;
  street_address_3: string;
  city: string;
  state: string;
  pincode: string;
  account_category_id: string;
  account_category_name: string;
  area_id: string;
  area_name: string;
  route_id: string;
  route_name: string;
  is_active: boolean;
};

type AccountCategoryRow = {
  id: string;
  code: string;
  name: string;
};

type AreaRow = {
  id: string;
  area_name: string;
};

type RouteRow = {
  id: string;
  route_name: string;
  area_id: string;
  area_name: string;
};

const DEFAULT_PAGE_SIZE = 50;

const EMPTY_CREATE_FORM = {
  firm_name: "",
  brand_ids: [] as string[],
  purchase_type: "CENTRAL",
  gstin: "",
  pan: "",
  owner_name: "",
  phone: "",
  alternate_phone: "",
  email: "",
  street: "",
  street_address_1: "",
  street_address_2: "",
  street_address_3: "",
  city: "",
  state: "",
  pincode: "",
  account_category_id: "",
  area_id: "",
  route_id: "",
};

const EMPTY_CATEGORY_FORM = {
  code: "",
  name: "",
  description: "",
};

const EMPTY_AREA_FORM = {
  area_name: "",
  city: "",
  state: "",
  pincode: "",
};

const EMPTY_ROUTE_FORM = {
  route_name: "",
  area_id: "",
};

function mapRow(row: Record<string, unknown>): VendorRow {
  return {
    id: String(row.id ?? ""),
    firm_name: String(row.firm_name ?? ""),
    brand_ids: asArray(row.brand_ids).map((item) => String(item)),
    brand_names: asArray(row.brand_names).map((item) => String(item)),
    purchase_type: String(row.purchase_type ?? ""),
    gstin: String(row.gstin ?? ""),
    pan: String(row.pan ?? ""),
    owner_name: String(row.owner_name ?? ""),
    phone: String(row.phone ?? ""),
    alternate_phone: String(row.alternate_phone ?? ""),
    email: String(row.email ?? ""),
    street: String(row.street ?? ""),
    street_address_1: String(row.street_address_1 ?? row.street ?? ""),
    street_address_2: String(row.street_address_2 ?? ""),
    street_address_3: String(row.street_address_3 ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    pincode: String(row.pincode ?? ""),
    account_category_id: String(row.account_category_id ?? ""),
    account_category_name: String(row.account_category_name ?? ""),
    area_id: String(row.area_id ?? ""),
    area_name: String(row.area_name ?? ""),
    route_id: String(row.route_id ?? ""),
    route_name: String(row.route_name ?? ""),
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
  const [areas, setAreas] = useState<AreaRow[]>([]);
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [openCategoryDialog, setOpenCategoryDialog] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ ...EMPTY_CATEGORY_FORM });
  const [openAreaDialog, setOpenAreaDialog] = useState(false);
  const [creatingArea, setCreatingArea] = useState(false);
  const [areaForm, setAreaForm] = useState({ ...EMPTY_AREA_FORM });
  const [openRouteDialog, setOpenRouteDialog] = useState(false);
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [routeForm, setRouteForm] = useState({ ...EMPTY_ROUTE_FORM });
  const [fetchingGstin, setFetchingGstin] = useState(false);
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
  const sundryCreditorsCategory = useMemo(
    () =>
      accountCategories.find(
        (category) =>
          category.name.trim().toUpperCase() === "SUNDRY CREDITORS" ||
          ["SUNDRY_CREDITORS", "SUNDRY-CREDITORS"].includes(category.code.trim().toUpperCase())
      ) ?? null,
    [accountCategories]
  );
  const createRoutes = useMemo(
    () => routes.filter((route) => !createForm.area_id || route.area_id === createForm.area_id),
    [routes, createForm.area_id]
  );
  const selectedRoutes = useMemo(
    () => routes.filter((route) => !selected?.area_id || route.area_id === selected.area_id),
    [routes, selected?.area_id]
  );

  async function loadAccountCategories() {
    if (!canReadVendors) {
      return;
    }
    try {
      const response = asObject(await fetchBackendFresh("/masters/account-categories?party_type=VENDOR&page=1&page_size=100"));
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

  async function loadAreas() {
    if (!canReadVendors) {
      return;
    }
    try {
      const response = asObject(await fetchBackendFresh("/masters/areas?page=1&page_size=1000"));
      setAreas(
        asArray(response.items).map((row) => ({
          id: String(row.id ?? ""),
          area_name: String(row.area_name ?? ""),
        }))
      );
    } catch {
      setAreas([]);
    }
  }

  async function loadRoutes() {
    if (!canReadVendors) {
      return;
    }
    try {
      const response = asObject(await fetchBackendFresh("/masters/routes?page=1&page_size=1000"));
      setRoutes(
        asArray(response.items).map((row) => ({
          id: String(row.id ?? ""),
          route_name: String(row.route_name ?? ""),
          area_id: String(row.area_id ?? ""),
          area_name: String(row.area_name ?? ""),
        }))
      );
    } catch {
      setRoutes([]);
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
      const response = asObject(await fetchBackendFresh(`/masters/vendors?${params.toString()}`));
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
    void loadAreas();
    void loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissionsLoaded, canReadVendors]);

  useEffect(() => {
    if (sundryCreditorsCategory && !createForm.account_category_id) {
      setCreateForm((prev) => ({ ...prev, account_category_id: sundryCreditorsCategory.id }));
    }
  }, [sundryCreditorsCategory, createForm.account_category_id]);

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
        street: selected.street_address_1 || null,
        street_address_1: selected.street_address_1 || null,
        street_address_2: selected.street_address_2 || null,
        street_address_3: selected.street_address_3 || null,
        city: selected.city || null,
        state: selected.state || null,
        pincode: selected.pincode || null,
        account_category_id: selected.account_category_id || sundryCreditorsCategory?.id || null,
        area_id: selected.area_id || null,
        route_id: selected.route_id || null,
        brand_ids: [],
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
    if (!createForm.firm_name.trim() || !createForm.gstin.trim() || !createForm.owner_name.trim()) {
      toast.error("Firm Name, GSTIN, and Owner Name are required.", { duration: 5000 });
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
        street: createForm.street_address_1.trim() || null,
        street_address_1: createForm.street_address_1.trim() || null,
        street_address_2: createForm.street_address_2.trim() || null,
        street_address_3: createForm.street_address_3.trim() || null,
        city: createForm.city.trim() || null,
        state: createForm.state.trim() || null,
        pincode: createForm.pincode.trim() || null,
        account_category_id: createForm.account_category_id || sundryCreditorsCategory?.id || null,
        area_id: createForm.area_id || null,
        route_id: createForm.route_id || null,
        brand_ids: [],
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

  async function fetchGstinDetails(target: "create" | "edit") {
    const gstin = target === "create" ? createForm.gstin.trim() : selected?.gstin.trim() ?? "";
    if (!gstin) {
      toast.error("Enter GSTIN before lookup.", { duration: 5000 });
      return;
    }
    setFetchingGstin(true);
    try {
      const details = asObject(await fetchBackendFresh(`/masters/vendors/gstin-lookup?gstin=${encodeURIComponent(gstin)}`));
      const patch = {
        gstin: String(details.gstin ?? gstin),
        firm_name: String(details.firm_name ?? ""),
        pan: String(details.pan ?? ""),
        owner_name: String(details.owner_name ?? ""),
        street: String(details.street ?? ""),
        street_address_1: String(details.street_address_1 ?? details.street ?? ""),
        street_address_2: String(details.street_address_2 ?? ""),
        street_address_3: String(details.street_address_3 ?? ""),
        city: String(details.city ?? ""),
        state: String(details.state ?? ""),
        pincode: String(details.pincode ?? ""),
        purchase_type: String(details.purchase_type ?? ""),
      };
      if (target === "create") {
        setCreateForm((prev) => ({
          ...prev,
          ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value)),
        }));
      } else if (selected) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === selected.id
              ? {
                  ...row,
                  ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value)),
                }
              : row
          )
        );
      }
      toast.success("GSTIN details fetched.", { duration: 5000 });
    } catch (error) {
      toast.error(`GSTIN lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setFetchingGstin(false);
    }
  }

  async function createInlineArea() {
    if (!canWriteVendors || !areaForm.area_name.trim()) {
      return;
    }
    setCreatingArea(true);
    try {
      const created = asObject(
        await postBackend("/masters/areas", {
          area_name: areaForm.area_name.trim(),
          city: areaForm.city.trim() || null,
          state: areaForm.state.trim() || null,
          pincode: areaForm.pincode.trim() || null,
        })
      );
      await loadAreas();
      const id = String(created.id ?? "");
      setCreateForm((prev) => ({ ...prev, area_id: id, route_id: "" }));
      setRouteForm((prev) => ({ ...prev, area_id: id }));
      setAreaForm({ ...EMPTY_AREA_FORM });
      setOpenAreaDialog(false);
      toast.success(`Area created: ${String(created.area_name ?? areaForm.area_name.trim())}`, { duration: 5000 });
    } catch (error) {
      toast.error(`Area create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingArea(false);
    }
  }

  async function createInlineRoute() {
    const areaId = routeForm.area_id || createForm.area_id || areas[0]?.id || "";
    if (!canWriteVendors || !routeForm.route_name.trim() || !areaId) {
      toast.error("Route name and area are required.", { duration: 5000 });
      return;
    }
    setCreatingRoute(true);
    try {
      const created = asObject(await postBackend("/masters/routes", { route_name: routeForm.route_name.trim(), area_id: areaId }));
      await loadRoutes();
      const id = String(created.id ?? "");
      setCreateForm((prev) => ({ ...prev, area_id: areaId, route_id: id }));
      setRouteForm({ ...EMPTY_ROUTE_FORM, area_id: areaId });
      setOpenRouteDialog(false);
      toast.success(`Route created: ${String(created.route_name ?? routeForm.route_name.trim())}`, { duration: 5000 });
    } catch (error) {
      toast.error(`Route create failed: ${error instanceof Error ? error.message : "Unknown error"}`, { duration: 5000 });
    } finally {
      setCreatingRoute(false);
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
                <DialogDescription>GSTIN lookup can fill the available TaxPro government profile fields.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Firm Name *</Label>
                  <Input value={createForm.firm_name} onChange={(e) => setCreateForm((prev) => ({ ...prev, firm_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Input value={createForm.purchase_type || "Auto from GSTIN"} readOnly className="bg-muted" />
                </div>
                <div className="space-y-1">
                  <Label>GSTIN *</Label>
                  <div className="flex gap-2">
                    <Input value={createForm.gstin} onChange={(e) => setCreateForm((prev) => ({ ...prev, gstin: e.target.value }))} />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => void fetchGstinDetails("create")}
                      disabled={fetchingGstin || !createForm.gstin.trim()}
                      title="Fetch GSTIN details"
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>PAN</Label>
                  <Input value={createForm.pan} onChange={(e) => setCreateForm((prev) => ({ ...prev, pan: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Owner Name *</Label>
                  <Input
                    value={createForm.owner_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, owner_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Whatsapp Number</Label>
                  <Input value={createForm.phone} onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Alternate Number</Label>
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
                  <Label>Street Address 1</Label>
                  <Input
                    value={createForm.street_address_1}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, street_address_1: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Street Address 2</Label>
                  <Input
                    value={createForm.street_address_2}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, street_address_2: e.target.value }))}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Street Address 3</Label>
                  <Input
                    value={createForm.street_address_3}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, street_address_3: e.target.value }))}
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
                    className="border-input h-9 w-full rounded-md border bg-muted px-3 text-sm"
                    value={createForm.account_category_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, account_category_id: e.target.value }))}
                    disabled
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
                  <div className="flex items-center justify-between gap-2">
                    <Label>Area</Label>
                    <Dialog open={openAreaDialog} onOpenChange={(open) => setOpenAreaDialog(canWriteVendors ? open : false)}>
                      <DialogTrigger asChild>
                        <Button size="sm" type="button" variant="outline" disabled={!canWriteVendors}>+ Add Area</Button>
                      </DialogTrigger>
                      <DialogContent className="w-[92vw] max-w-[520px]">
                        <DialogHeader><DialogTitle>Add Area</DialogTitle></DialogHeader>
                        <div className="grid gap-3">
                          <Input placeholder="Area name" value={areaForm.area_name} onChange={(e) => setAreaForm((prev) => ({ ...prev, area_name: e.target.value }))} />
                          <Input placeholder="City" value={areaForm.city} onChange={(e) => setAreaForm((prev) => ({ ...prev, city: e.target.value }))} />
                          <Input placeholder="State" value={areaForm.state} onChange={(e) => setAreaForm((prev) => ({ ...prev, state: e.target.value }))} />
                          <Input placeholder="Pincode" value={areaForm.pincode} onChange={(e) => setAreaForm((prev) => ({ ...prev, pincode: e.target.value }))} />
                        </div>
                        <DialogFooter><Button type="button" onClick={createInlineArea} disabled={creatingArea || !areaForm.area_name.trim()}>{creatingArea ? "Adding..." : "Add Area"}</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <select
                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    value={createForm.area_id}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, area_id: e.target.value, route_id: "" }))}
                  >
                    <option value="">Select area</option>
                    {areas.map((area) => <option key={area.id} value={area.id}>{area.area_name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Route</Label>
                    <Dialog open={openRouteDialog} onOpenChange={(open) => setOpenRouteDialog(canWriteVendors ? open : false)}>
                      <DialogTrigger asChild>
                        <Button size="sm" type="button" variant="outline" disabled={!canWriteVendors}>+ Add Route</Button>
                      </DialogTrigger>
                      <DialogContent className="w-[92vw] max-w-[520px]">
                        <DialogHeader><DialogTitle>Add Route</DialogTitle></DialogHeader>
                        <div className="grid gap-3">
                          <Input placeholder="Route name" value={routeForm.route_name} onChange={(e) => setRouteForm((prev) => ({ ...prev, route_name: e.target.value }))} />
                          <select className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={routeForm.area_id || createForm.area_id} onChange={(e) => setRouteForm((prev) => ({ ...prev, area_id: e.target.value }))}>
                            <option value="">Select area</option>
                            {areas.map((area) => <option key={area.id} value={area.id}>{area.area_name}</option>)}
                          </select>
                        </div>
                        <DialogFooter><Button type="button" onClick={createInlineRoute} disabled={creatingRoute || !routeForm.route_name.trim() || !(routeForm.area_id || createForm.area_id)}>{creatingRoute ? "Adding..." : "Add Route"}</Button></DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                  <select
                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    value={createForm.route_id}
                    onChange={(e) => {
                      const nextRoute = routes.find((route) => route.id === e.target.value);
                      setCreateForm((prev) => ({ ...prev, route_id: e.target.value, area_id: nextRoute?.area_id || prev.area_id }));
                    }}
                  >
                    <option value="">Select route</option>
                    {createRoutes.map((route) => <option key={route.id} value={route.id}>{route.route_name}</option>)}
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createVendor} disabled={!canWriteVendors || creating || !createForm.firm_name.trim() || !createForm.gstin.trim() || !createForm.owner_name.trim()}>
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
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Type</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">GSTIN</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Whatsapp</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Account Category</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Area</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Route</TableHead>
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
                    <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground">
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
                  <TableCell>{row.purchase_type || "-"}</TableCell>
                  <TableCell>{row.gstin || "-"}</TableCell>
                  <TableCell>{row.phone || "-"}</TableCell>
                  <TableCell>{row.account_category_name || "-"}</TableCell>
                  <TableCell>{row.area_name || "-"}</TableCell>
                  <TableCell>{row.route_name || "-"}</TableCell>
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
                              <Label>Firm Name *</Label>
                              <Input value={selected.firm_name} onChange={(e) => updateSelected("firm_name", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Type</Label>
                              <Input value={selected.purchase_type || "Auto from GSTIN"} readOnly className="bg-muted" />
                            </div>
                            <div className="space-y-1">
                              <Label>GSTIN *</Label>
                              <div className="flex gap-2">
                                <Input value={selected.gstin} onChange={(e) => updateSelected("gstin", e.target.value)} />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => void fetchGstinDetails("edit")}
                                  disabled={fetchingGstin || !selected.gstin.trim()}
                                  title="Fetch GSTIN details"
                                >
                                  <Search className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label>PAN</Label>
                              <Input value={selected.pan} onChange={(e) => updateSelected("pan", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Owner Name *</Label>
                              <Input value={selected.owner_name} onChange={(e) => updateSelected("owner_name", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Whatsapp Number</Label>
                              <Input value={selected.phone} onChange={(e) => updateSelected("phone", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Alternate Number</Label>
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
                              <Label>Street Address 1</Label>
                              <Input value={selected.street_address_1} onChange={(e) => updateSelected("street_address_1", e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label>Street Address 2</Label>
                              <Input value={selected.street_address_2} onChange={(e) => updateSelected("street_address_2", e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label>Street Address 3</Label>
                              <Input value={selected.street_address_3} onChange={(e) => updateSelected("street_address_3", e.target.value)} />
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
                            <div className="space-y-1 md:col-span-2">
                              <Label>Account Category</Label>
                              <select
                                className="border-input h-9 w-full rounded-md border bg-muted px-3 text-sm"
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
                                disabled
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
                              <Label>Area</Label>
                              <select
                                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                                value={selected.area_id}
                                onChange={(e) => {
                                  const nextAreaId = e.target.value;
                                  const nextArea = areas.find((area) => area.id === nextAreaId);
                                  setRows((prev) =>
                                    prev.map((row) =>
                                      row.id === selected.id
                                        ? { ...row, area_id: nextAreaId, area_name: nextArea?.area_name ?? "", route_id: "", route_name: "" }
                                        : row
                                    )
                                  );
                                }}
                              >
                                <option value="">Select area</option>
                                {areas.map((area) => <option key={area.id} value={area.id}>{area.area_name}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <Label>Route</Label>
                              <select
                                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                                value={selected.route_id}
                                onChange={(e) => {
                                  const nextRoute = routes.find((route) => route.id === e.target.value);
                                  setRows((prev) =>
                                    prev.map((row) =>
                                      row.id === selected.id
                                        ? {
                                            ...row,
                                            route_id: e.target.value,
                                            route_name: nextRoute?.route_name ?? "",
                                            area_id: nextRoute?.area_id || row.area_id,
                                            area_name: nextRoute?.area_name || row.area_name,
                                          }
                                        : row
                                    )
                                  );
                                }}
                              >
                                <option value="">Select route</option>
                                {selectedRoutes.map((route) => <option key={route.id} value={route.id}>{route.route_name}</option>)}
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
                          <Button
                            onClick={saveSelected}
                            disabled={!canWriteVendors || !selected || savingId === selected.id || !selected.firm_name.trim() || !selected.gstin.trim() || !selected.owner_name.trim()}
                          >
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
