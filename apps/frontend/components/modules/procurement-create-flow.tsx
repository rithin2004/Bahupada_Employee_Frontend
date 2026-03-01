"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { asArray, asObject, fetchBackend, postBackend } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function challanBatchPreview(index: number) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `CHL-${y}${m}${d}-AUTO-${String(index + 1).padStart(3, "0")}`;
}

const LIST_PAGE_SIZE = 50;

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
  const [previewChallan, setPreviewChallan] = useState<ChallanForBill | null>(null);
  const [selectedChallanId, setSelectedChallanId] = useState("");
  const [billNumber, setBillNumber] = useState(createBillNo);
  const [billDate, setBillDate] = useState(new Date().toISOString().slice(0, 10));
  const [billItems, setBillItems] = useState<BillItemDraft[]>([]);

  const [feedback, setFeedback] = useState("");
  const [submittingChallan, setSubmittingChallan] = useState(false);
  const [submittingBill, setSubmittingBill] = useState(false);

  async function loadMasters() {
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
      const message = `Load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    }
  }

  async function loadChallans() {
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
      const message = `Challan load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoadingChallans(false);
    }
  }

  async function loadBills() {
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
          item_count: Number(row.item_count ?? 0),
        }))
      );
    } catch (error) {
      const message = `Bill load failed: ${error instanceof Error ? error.message : "Unknown error"}`;
      setFeedback(message);
      toast.error(message, { duration: 5000 });
    } finally {
      setLoadingBills(false);
    }
  }

  useEffect(() => {
    void loadMasters();
    void loadChallans();
    void loadBills();
  }, []);

  useEffect(() => {
    async function loadRacks() {
      if (!warehouseId) {
        setRacks([]);
        setRackId("");
        return;
      }
      try {
        const params = new URLSearchParams();
        params.set("page", "1");
        params.set("page_size", "100");
        params.set("warehouse_id", warehouseId);
        const res = asObject(await fetchBackend(`/masters/racks?${params.toString()}`));
        const rows = asArray(res.items)
          .map((row) => ({
            id: String(row.id ?? ""),
            label: String(row.rack_type ?? `Rack ${String(row.id ?? "").slice(0, 6)}`),
          }))
          .filter((row) => row.id);
        setRacks(rows);
        if (!rows.some((rack) => rack.id === rackId)) {
          setRackId("");
        }
      } catch {
        setRacks([]);
      }
    }
    void loadRacks();
  }, [warehouseId, rackId]);

  useEffect(() => {
    async function searchProducts() {
      const term = productSearch.trim();
      if (term.length < 3) {
        setProductResults([]);
        return;
      }
      setSearchingProducts(true);
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
        setProductResults(mapped);
      } catch {
        setProductResults([]);
      } finally {
        setSearchingProducts(false);
      }
    }

    const timer = setTimeout(() => {
      void searchProducts();
    }, 250);
    return () => clearTimeout(timer);
  }, [productSearch]);

  useEffect(() => {
    if (!selectedChallanId) {
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
  }, [challans, selectedChallanId]);

  const canCreateChallan = useMemo(() => {
    return Boolean(vendorId && warehouseId && items.length > 0 && items.every((row) => Number(row.quantity) > 0));
  }, [items, vendorId, warehouseId]);
  const normalizedProductSearch = productSearch.trim();
  const showProductNoResults = normalizedProductSearch.length >= 3 && !searchingProducts && productResults.length === 0;

  const canCreateBill = useMemo(() => {
    if (!selectedChallanId || !billNumber.trim() || !billDate || billItems.length === 0) {
      return false;
    }
    return billItems.every((item) => {
      const quantity = Number(item.quantity);
      const damaged = Number(item.damaged_quantity);
      const unitPrice = Number(item.unit_price);
      return Number.isFinite(quantity) && quantity >= 0 && Number.isFinite(damaged) && damaged >= 0 && damaged <= quantity && Number.isFinite(unitPrice) && unitPrice >= 0;
    });
  }, [billDate, billItems, billNumber, selectedChallanId]);

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
        row.challan_reference_no.toLowerCase().includes(term) ||
        row.status.toLowerCase().includes(term)
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
        challan_id: selectedChallanId,
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
                          <Label>Vendor *</Label>
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
                          <Label>Warehouse *</Label>
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
                          <Label>Rack (Optional)</Label>
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
                        <Input
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Type first 3 letters of SKU, name or brand"
                        />
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
                  placeholder="Search bill no, vendor, challan ref, status"
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
                        <td className="px-3 py-2"><Skeleton className="h-5 w-36" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-8" /></td>
                        <td className="px-3 py-2"><Skeleton className="h-5 w-16" /></td>
                      </tr>
                    ))
                  ) : filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-2 text-muted-foreground">
                        No bills found.
                      </td>
                    </tr>
                  ) : (
                    billPageRows.map((bill) => (
                      <tr key={bill.id} className="border-t">
                        <td className="px-3 py-2">{bill.bill_number}</td>
                        <td className="px-3 py-2">{bill.bill_date}</td>
                        <td className="px-3 py-2">{bill.vendor_name || "-"}</td>
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
  );
}
