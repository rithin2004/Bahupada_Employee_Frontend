"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  asArray,
  asObject,
  backendApiBaseUrl,
  fetchBackend,
  fetchBackendFresh,
  fetchPortalMe,
  postBackend,
  readPortalSession,
} from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesBillWorkspace } from "@/components/modules/sales-bill-workspace";
import { SalesInvoiceRefWizard } from "@/components/modules/sales-invoice-ref-wizard";

type SalesChallanSummary = {
  id: string;
  reference_no: string;
  customer_name: string;
  warehouse_name: string;
  item_count: number;
  status: string;
  created_at: string;
};

type SalesBillSummary = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  total_amount: string;
  status: string;
  delivery_status: string;
  item_count: number;
  created_at: string;
};

export function SalesCreateFlow() {
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadSales, setCanReadSales] = useState(false);
  const [canWriteSales, setCanWriteSales] = useState(false);
  
  const [challans, setChallans] = useState<SalesChallanSummary[]>([]);
  const [bills, setBills] = useState<SalesBillSummary[]>([]);
  const [loadingChallans, setLoadingChallans] = useState(true);
  const [loadingBills, setLoadingBills] = useState(true);
  
  const [challanSearch, setChallanSearch] = useState("");
  const [billSearch, setBillSearch] = useState("");
  
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"challan" | "bill">("bill");
  const [editingId, setEditingId] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const payload = asObject(await fetchPortalMe());
        const isSuperAdmin = Boolean(payload.is_super_admin);
        const permissions = asObject(payload.admin_permissions);
        const sales = asObject(permissions.sales);
        if (!active) return;
        setCanReadSales(isSuperAdmin || Boolean(sales.read) || Boolean(sales.write));
        setCanWriteSales(isSuperAdmin || Boolean(sales.write));
        setPermissionsLoaded(true);
      } catch {
        if (!active) return;
        setPermissionsLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  async function loadChallans() {
    if (!canReadSales) return;
    setLoadingChallans(true);
    try {
      const res = asObject(await fetchBackend("/sales/sales-orders?page=1&page_size=100"));
      setChallans(asArray(res.items).map(row => ({
        id: String(row.id),
        reference_no: String(row.invoice_number || row.reference_no || "-"),
        customer_name: String(row.customer_name || "-"),
        warehouse_name: String(row.warehouse_name || "-"),
        item_count: Number(row.item_count || 0),
        status: String(row.status || "-"),
        created_at: String(row.created_at || ""),
      })));
    } catch (e) {
      toast.error("Failed to load sales challans");
    } finally {
      setLoadingChallans(false);
    }
  }

  async function loadBills() {
    if (!canReadSales) return;
    setLoadingBills(true);
    try {
      const res = asObject(await fetchBackend("/sales/sales-final-invoices?page=1&page_size=100"));
      setBills(asArray(res.items).map(row => ({
        id: String(row.id),
        invoice_number: String(row.invoice_number || "-"),
        invoice_date: String(row.invoice_date || ""),
        customer_name: String(row.customer_name || "-"),
        total_amount: String(row.total_amount || "0"),
        status: String(row.status || "-"),
        delivery_status: String(row.delivery_status || "-"),
        item_count: Number(row.item_count || 0),
        created_at: String(row.created_at || ""),
      })));
    } catch (e) {
      toast.error("Failed to load sales bills");
    } finally {
      setLoadingBills(false);
    }
  }

  useEffect(() => {
    if (permissionsLoaded && canReadSales) {
      void loadChallans();
      void loadBills();
    }
  }, [permissionsLoaded, canReadSales]);

  const filteredChallans = challans.filter(c => 
    c.reference_no.toLowerCase().includes(challanSearch.toLowerCase()) ||
    c.customer_name.toLowerCase().includes(challanSearch.toLowerCase())
  );

  const filteredBills = bills.filter(b => 
    b.invoice_number.toLowerCase().includes(billSearch.toLowerCase()) ||
    b.customer_name.toLowerCase().includes(billSearch.toLowerCase())
  );

  const [activeTab, setActiveTab] = useState<"challan" | "bill">("bill");
  const [receiptWizardOpen, setReceiptWizardOpen] = useState(false);
  const [receiptWizardCtx, setReceiptWizardCtx] = useState<{ customerId: string; salesFinalInvoiceId?: string } | null>(null);

  if (showWorkspace) {
    return (
      <SalesBillWorkspace 
        canWriteSales={canWriteSales}
        onClose={() => {
          setShowWorkspace(false);
          setEditingId("");
          setActiveTab(workspaceMode);
          void loadChallans();
          void loadBills();
        }}
        onSaved={(detail) => {
          setShowWorkspace(false);
          setEditingId("");
          setActiveTab(workspaceMode);
          void loadChallans();
          void loadBills();
          if (detail?.salesFinalInvoiceId && workspaceMode === "bill") {
            setReceiptWizardCtx({ customerId: detail.customerId, salesFinalInvoiceId: detail.salesFinalInvoiceId });
            setReceiptWizardOpen(true);
          }
        }}
        initialId={editingId}
        mode={workspaceMode}
      />
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sales Management</h1>
        <div className="flex gap-2">
          {canWriteSales && (
            <>
              <Button onClick={() => { setWorkspaceMode("challan"); setEditingId(""); setShowWorkspace(true); }}>
                + New Challan
              </Button>
              <Button onClick={() => { setWorkspaceMode("bill"); setEditingId(""); setShowWorkspace(true); }}>
                + New Bill
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "challan" | "bill")}>
        <TabsList>
          <TabsTrigger value="bill">Sales Bills</TabsTrigger>
          <TabsTrigger value="challan">Sales Challans</TabsTrigger>
        </TabsList>

        <TabsContent value="challan" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Sales Challans</CardTitle>
                  <CardDescription>Manage and track your sales orders/challans.</CardDescription>
                </div>
                <Input 
                  placeholder="Search challans..." 
                  className="max-w-xs" 
                  value={challanSearch}
                  onChange={e => setChallanSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Reference</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Warehouse</th>
                      <th className="px-3 py-2 text-left">Items</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingChallans ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-t">
                          <td colSpan={6} className="px-3 py-4"><Skeleton className="h-4 w-full" /></td>
                        </tr>
                      ))
                    ) : filteredChallans.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No challans found.</td></tr>
                    ) : (
                      filteredChallans.map(challan => (
                        <tr key={challan.id} className="border-t">
                          <td className="px-3 py-2">{challan.reference_no}</td>
                          <td className="px-3 py-2">{challan.customer_name}</td>
                          <td className="px-3 py-2">{challan.warehouse_name}</td>
                          <td className="px-3 py-2">{challan.item_count}</td>
                          <td className="px-3 py-2">{challan.status}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setWorkspaceMode("challan"); setEditingId(challan.id); setShowWorkspace(true); }}>
                                View/Edit
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => window.open(`${backendApiBaseUrl}/sales/sales-orders/${challan.id}/print`, "_blank")}>
                                Print
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bill" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Sales Bills</CardTitle>
                  <CardDescription>View and manage final sales invoices.</CardDescription>
                </div>
                <Input 
                  placeholder="Search bills..." 
                  className="max-w-xs" 
                  value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      <th className="px-3 py-2 text-left">Bill No</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Amount</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingBills ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-t">
                          <td colSpan={6} className="px-3 py-4"><Skeleton className="h-4 w-full" /></td>
                        </tr>
                      ))
                    ) : filteredBills.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No bills found.</td></tr>
                    ) : (
                      filteredBills.map(bill => (
                        <tr key={bill.id} className="border-t">
                          <td className="px-3 py-2">{bill.invoice_number}</td>
                          <td className="px-3 py-2">{bill.invoice_date}</td>
                          <td className="px-3 py-2">{bill.customer_name}</td>
                          <td className="px-3 py-2">{bill.total_amount}</td>
                          <td className="px-3 py-2">{bill.status}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setWorkspaceMode("bill"); setEditingId(bill.id); setShowWorkspace(true); }}>
                                View/Edit
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => window.open(`${backendApiBaseUrl}/sales/sales-final-invoices/${bill.id}/print`, "_blank")}>
                                Print
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      {receiptWizardCtx ? (
        <SalesInvoiceRefWizard
          open={receiptWizardOpen}
          onOpenChange={(open) => {
            setReceiptWizardOpen(open);
            if (!open) {
              setReceiptWizardCtx(null);
            }
          }}
          customerId={receiptWizardCtx.customerId}
          highlightSalesFinalInvoiceId={receiptWizardCtx.salesFinalInvoiceId}
          apiBase="sales"
          onRecorded={() => {
            void loadBills();
          }}
        />
      ) : null}
    </div>
  );
}
