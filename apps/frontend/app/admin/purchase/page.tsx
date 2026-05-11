"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";

import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { AppShell } from "@/components/layout/app-shell";
import { useOptionalEntryNavigationGuard } from "@/components/modules/entry-navigation-guard";
import { PurchaseBillRefWizard } from "@/components/modules/purchase-bill-ref-wizard";
import { ProcurementCreateFlow } from "@/components/modules/procurement-create-flow";
import { PurchaseEntryWorkspace } from "@/components/modules/purchase-entry-workspace";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { asObject, fetchPortalMe, readPortalSession } from "@/lib/backend-api";

function hasAdminAccessToken() {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(readPortalSession().accessToken);
}

export default function AdminPurchasePage() {
  const [activeTab, setActiveTab] = useState<"challan" | "bill">("challan");
  const [showPurchaseEntry, setShowPurchaseEntry] = useState(false);
  const [billListRefreshKey, setBillListRefreshKey] = useState(0);

  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [canReadPurchase, setCanReadPurchase] = useState(false);
  const [canWritePurchase, setCanWritePurchase] = useState(false);

  const [billRefWizardOpen, setBillRefWizardOpen] = useState(false);
  const [billRefWizardCtx, setBillRefWizardCtx] = useState<{ vendorId: string; purchaseBillId?: string } | null>(null);

  useEffect(() => {
    if (!hasAdminAccessToken()) {
      queueMicrotask(() => {
        setPermissionsLoaded(true);
      });
      return;
    }
    let active = true;
    void (async () => {
      try {
        const payload = asObject(await fetchPortalMe());
        const isSuperAdmin = Boolean(payload.is_super_admin);
        const rawPerms = payload.admin_permissions;
        const adminPerms =
          rawPerms && typeof rawPerms === "object" && !Array.isArray(rawPerms) ? (rawPerms as Record<string, unknown>) : {};
        const purchasePermission = asObject(adminPerms.purchase);
        const canRead = isSuperAdmin || Boolean(purchasePermission.read) || Boolean(purchasePermission.write);
        const canWrite = isSuperAdmin || Boolean(purchasePermission.write);
        if (!active) return;
        setCanReadPurchase(canRead);
        setCanWritePurchase(canWrite);
        setPermissionsLoaded(true);
      } catch {
        if (!active) return;
        setCanReadPurchase(false);
        setCanWritePurchase(false);
        setPermissionsLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <PortalAuthGate portal="ADMIN">
      <AppShell role="admin" activeKey="purchase" userName="Admin User">
        <PurchaseModuleTabs
          permissionsLoaded={permissionsLoaded}
          canReadPurchase={canReadPurchase}
          canWritePurchase={canWritePurchase}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          showPurchaseEntry={showPurchaseEntry}
          setShowPurchaseEntry={setShowPurchaseEntry}
          billListRefreshKey={billListRefreshKey}
          setBillListRefreshKey={setBillListRefreshKey}
          setBillRefWizardCtx={setBillRefWizardCtx}
          setBillRefWizardOpen={setBillRefWizardOpen}
        />

        {billRefWizardCtx ? (
          <PurchaseBillRefWizard
            open={billRefWizardOpen}
            onOpenChange={(open) => {
              setBillRefWizardOpen(open);
              if (!open) {
                setBillRefWizardCtx(null);
              }
            }}
            vendorId={billRefWizardCtx.vendorId}
            highlightPurchaseBillId={billRefWizardCtx.purchaseBillId}
          />
        ) : null}
      </AppShell>
    </PortalAuthGate>
  );
}

type PurchaseModuleTabsProps = {
  permissionsLoaded: boolean;
  canReadPurchase: boolean;
  canWritePurchase: boolean;
  activeTab: "challan" | "bill";
  setActiveTab: (v: "challan" | "bill") => void;
  showPurchaseEntry: boolean;
  setShowPurchaseEntry: (v: boolean) => void;
  billListRefreshKey: number;
  setBillListRefreshKey: Dispatch<SetStateAction<number>>;
  setBillRefWizardCtx: Dispatch<SetStateAction<{ vendorId: string; purchaseBillId?: string } | null>>;
  setBillRefWizardOpen: Dispatch<SetStateAction<boolean>>;
};

/** Renders inside AppShell so `useOptionalEntryNavigationGuard` sees the same provider as entry workspaces. */
function PurchaseModuleTabs({
  permissionsLoaded,
  canReadPurchase,
  canWritePurchase,
  activeTab,
  setActiveTab,
  showPurchaseEntry,
  setShowPurchaseEntry,
  billListRefreshKey,
  setBillListRefreshKey,
  setBillRefWizardCtx,
  setBillRefWizardOpen,
}: PurchaseModuleTabsProps) {
  const entryNav = useOptionalEntryNavigationGuard();

  return (
    <div className="w-full min-w-0 space-y-4">
      {permissionsLoaded && canReadPurchase && !canWritePurchase ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Read-only access. Create and update actions are limited.
        </p>
      ) : null}

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          void (async () => {
            const nextTab = value === "bill" ? "bill" : "challan";
            if (entryNav) {
              const ok = await entryNav.tryNavigateAway();
              if (!ok) {
                return;
              }
            }
            setActiveTab(nextTab);
            if (nextTab !== "bill") {
              setShowPurchaseEntry(false);
            }
          })();
        }}
        className="w-full min-w-0"
      >
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="challan">Purchase Challan</TabsTrigger>
          <TabsTrigger value="bill">Purchase Bill</TabsTrigger>
        </TabsList>

        <TabsContent value="challan" className="mt-4 min-w-0">
          <ProcurementCreateFlow initialTab="challan" hideTabs />
        </TabsContent>

        <TabsContent value="bill" className="mt-4 min-w-0">
          <div className="w-full min-w-0 space-y-4">
            {showPurchaseEntry ? (
              <PurchaseEntryWorkspace
                canWritePurchase={canWritePurchase}
                onSaved={(detail) => {
                  setShowPurchaseEntry(false);
                  setActiveTab("bill");
                  setBillListRefreshKey((prev) => prev + 1);
                  if (detail) {
                    setBillRefWizardCtx({ vendorId: detail.vendorId, purchaseBillId: detail.purchaseBillId });
                    setBillRefWizardOpen(true);
                  }
                }}
                onClose={() => setShowPurchaseEntry(false)}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    onClick={() => setShowPurchaseEntry(true)}
                    disabled={!permissionsLoaded || !canWritePurchase}
                  >
                    Create Purchase Bill
                  </Button>
                </div>
                <ProcurementCreateFlow key={`bill-list-${billListRefreshKey}`} initialTab="bill" hideTabs hideBillCreateButton />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
