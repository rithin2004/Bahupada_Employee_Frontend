"use client";

import { useState } from "react";

import { PortalAuthGate } from "@/components/auth/portal-auth-gate";
import { AppShell } from "@/components/layout/app-shell";
import { ProcurementCreateFlow } from "@/components/modules/procurement-create-flow";
import { PurchaseEntryWorkspace } from "@/components/modules/purchase-entry-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AdminPurchasePage() {
  const [activeTab, setActiveTab] = useState<"challan" | "bill">("challan");
  const [showPurchaseEntry, setShowPurchaseEntry] = useState(false);

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
                  <PurchaseEntryWorkspace />
                </div>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Purchase Bill</CardTitle>
                    <CardDescription>
                      Open the bill workspace only when you want to create a purchase bill.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-muted-foreground">
                      Existing purchase-bill creation stays behind the button instead of opening immediately.
                    </p>
                    <Button onClick={() => setShowPurchaseEntry(true)}>Create Purchase Bill</Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </PortalAuthGate>
  );
}
