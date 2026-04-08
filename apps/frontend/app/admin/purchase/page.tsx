"use client";

import { useState } from "react";

import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { AppShell } from "@/components/layout/app-shell";
import { ProcurementCreateFlow } from "@/components/modules/procurement-create-flow";
import { PurchaseEntryWorkspace } from "@/components/modules/purchase-entry-workspace";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminPurchasePage() {
  const [activeTab, setActiveTab] = useState<"challan" | "bill">("challan");
  const [showPurchaseEntry, setShowPurchaseEntry] = useState(false);
  const [billListRefreshKey, setBillListRefreshKey] = useState(0);

  return (
    <PortalAuthGate portal="ADMIN">
      <AppShell role="admin" activeKey="purchase" userName="Admin User">
        <div className="space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const nextTab = value === "bill" ? "bill" : "challan";
              setActiveTab(nextTab);
              if (nextTab !== "bill") {
                setShowPurchaseEntry(false);
              }
            }}
            className="w-full"
          >
            <TabsList>
              <TabsTrigger value="challan">Purchase Challan</TabsTrigger>
              <TabsTrigger value="bill">Purchase Bill</TabsTrigger>
            </TabsList>

            <TabsContent value="challan" className="mt-4">
              <ProcurementCreateFlow initialTab="challan" hideTabs />
            </TabsContent>

            <TabsContent value="bill" className="mt-4">
              <div className="space-y-4">
                {showPurchaseEntry ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h1 className="text-lg font-semibold">Create Purchase Bill</h1>
                        <p className="text-sm text-muted-foreground">
                          Keyboard-first purchase bill workflow.
                        </p>
                      </div>
                      <Button variant="outline" onClick={() => setShowPurchaseEntry(false)}>
                        Back To Purchase Bills
                      </Button>
                    </div>
                    <PurchaseEntryWorkspace
                      onSaved={() => {
                        setShowPurchaseEntry(false);
                        setActiveTab("bill");
                        setBillListRefreshKey((prev) => prev + 1);
                      }}
                    />
                  </div>
                ) : null}

                {!showPurchaseEntry ? (
                  <div className="flex items-center justify-end">
                    <Button onClick={() => setShowPurchaseEntry(true)}>Create Purchase Bill</Button>
                  </div>
                ) : null}

                <ProcurementCreateFlow key={`bill-list-${billListRefreshKey}`} initialTab="bill" hideTabs hideBillCreateButton />
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </PortalAuthGate>
  );
}
