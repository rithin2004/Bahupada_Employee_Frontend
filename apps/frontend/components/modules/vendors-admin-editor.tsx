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

type VendorRow = {
  id: string;
  name: string;
  firm_name: string;
  gstin: string;
  phone: string;
  city: string;
  state: string;
  is_active: boolean;
};

const DEFAULT_PAGE_SIZE = 50;

const EMPTY_CREATE_FORM = {
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

function mapRow(row: Record<string, unknown>): VendorRow {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    firm_name: String(row.firm_name ?? ""),
    gstin: String(row.gstin ?? ""),
    phone: String(row.phone ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    is_active: Boolean(row.is_active ?? true),
  };
}

export function VendorsAdminEditor() {
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
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

  async function load(page: number, searchText: string, pageSizeValue = pageSize) {
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
    void load(currentPage, search, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, search, pageSize]);

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
    if (!selected) {
      return;
    }
    setSavingId(selected.id);
    setFeedback("");
    try {
      await patchBackend(`/masters/vendors/${selected.id}`, {
        name: selected.name,
        firm_name: selected.firm_name || null,
        gstin: selected.gstin || null,
        phone: selected.phone || null,
        city: selected.city || null,
        state: selected.state || null,
        is_active: selected.is_active,
      });
      toast.success(`Vendor updated: ${selected.name}`, { duration: 5000 });
      setFeedback(`Vendor updated: ${selected.name}`);
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
    if (!createForm.name.trim()) {
      return;
    }
    setCreating(true);
    setFeedback("");
    try {
      await postBackend("/masters/vendors", {
        name: createForm.name.trim(),
        firm_name: createForm.firm_name.trim() || null,
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
      });
      const createdName = createForm.name.trim();
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

  async function deleteSelected() {
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
          <Button variant="destructive" onClick={deleteSelected} disabled={loading || selectedIds.length === 0}>
            Delete Selected
          </Button>
          <Dialog open={openCreateDialog} onOpenChange={setOpenCreateDialog}>
            <DialogTrigger asChild>
              <Button>Add Vendor</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add Vendor</DialogTitle>
                <DialogDescription>Create a vendor using the `VendorCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Name *</Label>
                  <Input value={createForm.name} onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Firm Name</Label>
                  <Input
                    value={createForm.firm_name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, firm_name: e.target.value }))}
                  />
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
              </div>
              <DialogFooter>
                <Button onClick={createVendor} disabled={creating || !createForm.name.trim()}>
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
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Name</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Firm Name</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">GSTIN</TableHead>
              <TableHead className="uppercase tracking-wide text-slate-600 dark:text-slate-300">Phone</TableHead>
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
                    <TableCell><Skeleton className="h-5 w-24 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-10 dark:h-5" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-16" /></TableCell>
                  </TableRow>
                ))
              : null}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
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
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.firm_name || "-"}</TableCell>
                  <TableCell>{row.gstin || "-"}</TableCell>
                  <TableCell>{row.phone || "-"}</TableCell>
                  <TableCell>{row.city || "-"}</TableCell>
                  <TableCell>{row.state || "-"}</TableCell>
                  <TableCell>{row.is_active ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Dialog open={openId === row.id} onOpenChange={(open) => setOpenId(open ? row.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline">
                          Edit
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[85vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Edit Vendor</DialogTitle>
                          <DialogDescription>Update vendor fields and save.</DialogDescription>
                        </DialogHeader>
                        {selected ? (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1 md:col-span-2">
                              <Label>Name</Label>
                              <Input value={selected.name} onChange={(e) => updateSelected("name", e.target.value)} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                              <Label>Firm Name</Label>
                              <Input value={selected.firm_name} onChange={(e) => updateSelected("firm_name", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>GSTIN</Label>
                              <Input value={selected.gstin} onChange={(e) => updateSelected("gstin", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>Phone</Label>
                              <Input value={selected.phone} onChange={(e) => updateSelected("phone", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>City</Label>
                              <Input value={selected.city} onChange={(e) => updateSelected("city", e.target.value)} />
                            </div>
                            <div className="space-y-1">
                              <Label>State</Label>
                              <Input value={selected.state} onChange={(e) => updateSelected("state", e.target.value)} />
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
          onFirst={() => setCurrentPage(1)}
          onPrevious={() => setCurrentPage((p) => p - 1)}
          onNext={() => setCurrentPage((p) => p + 1)}
          onLast={() => setCurrentPage(totalPages)}
        />
      </CardContent>
    </Card>
  );
}
