"use client";

import { useEffect, useState } from "react";

import { asArray, fetchBackend, postBackend } from "@/lib/backend-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

type AreaOption = {
  id: string;
  area_name: string;
};

const customerClassOptions = [
  "B2B_DISTRIBUTOR",
  "B2B_SEMI_WHOLESALE",
  "B2B_TOP_OUTLET",
  "B2B_MASS_GROCERY",
  "B2C",
] as const;

function toNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")
  );
}

export function MastersCreatePanel() {
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);

  const [openArea, setOpenArea] = useState(false);
  const [openRoute, setOpenRoute] = useState(false);
  const [openWarehouse, setOpenWarehouse] = useState(false);
  const [openProduct, setOpenProduct] = useState(false);
  const [openCustomer, setOpenCustomer] = useState(false);

  const [areaForm, setAreaForm] = useState({
    area_name: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
  });

  const [routeForm, setRouteForm] = useState({
    route_name: "",
    area_id: "",
  });

  const [warehouseForm, setWarehouseForm] = useState({
    code: "",
    name: "",
    street: "",
    city: "",
    state: "",
    pincode: "",
    latitude: "",
    longitude: "",
  });

  const [productForm, setProductForm] = useState({
    sku: "",
    name: "",
    brand_id: "",
    category_id: "",
    sub_category_id: "",
    description: "",
    hsn_id: "",
    primary_unit_id: "",
    secondary_unit_id: "",
    third_unit_id: "",
    secondary_unit_quantity: "",
    third_unit_quantity: "",
    weight_in_grams: "",
    base_price: "0",
    tax_percent: "0",
  });

  const [customerForm, setCustomerForm] = useState({
    name: "",
    outlet_name: "",
    customer_class: "B2B_DISTRIBUTOR" as (typeof customerClassOptions)[number],
    route_id: "",
    route_name: "",
    gstin: "",
    owner_name: "",
    phone: "",
    email: "",
    credit_limit: "0",
    is_line_sale_outlet: false,
  });

  useEffect(() => {
    fetchBackend("/masters/areas")
      .then((response) => {
        const parsed = asArray(response).map((item) => ({
          id: String(item.id ?? ""),
          area_name: String(item.area_name ?? ""),
        }));
        setAreas(parsed.filter((item) => item.id && item.area_name));
      })
      .catch(() => {
        // Area list endpoint may not be present; route dialog still allows manual area_id.
      });
  }, []);

  async function createArea() {
    setSubmitting("area");
    setFeedback("");
    try {
      const payload = cleanPayload({
        area_name: areaForm.area_name,
        city: areaForm.city,
        state: areaForm.state,
        pincode: areaForm.pincode,
        latitude: toNumber(areaForm.latitude),
        longitude: toNumber(areaForm.longitude),
      });
      const response = await postBackend("/masters/areas", payload);
      const createdId = String((response as { id?: string }).id ?? "");
      const createdName = String((response as { area_name?: string }).area_name ?? areaForm.area_name);
      if (createdId && createdName) {
        setAreas((prev) => [{ id: createdId, area_name: createdName }, ...prev]);
      }
      setAreaForm({ area_name: "", city: "", state: "", pincode: "", latitude: "", longitude: "" });
      setFeedback("Area created.");
      setOpenArea(false);
    } catch (error) {
      setFeedback(`Area create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(null);
    }
  }

  async function createRoute() {
    setSubmitting("route");
    setFeedback("");
    try {
      const payload = cleanPayload({
        route_name: routeForm.route_name,
        area_id: routeForm.area_id,
      });
      await postBackend("/masters/routes", payload);
      setRouteForm({ route_name: "", area_id: "" });
      setFeedback("Route created.");
      setOpenRoute(false);
    } catch (error) {
      setFeedback(`Route create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(null);
    }
  }

  async function createWarehouse() {
    setSubmitting("warehouse");
    setFeedback("");
    try {
      const payload = cleanPayload({
        code: warehouseForm.code,
        name: warehouseForm.name,
        street: warehouseForm.street,
        city: warehouseForm.city,
        state: warehouseForm.state,
        pincode: warehouseForm.pincode,
        latitude: toNumber(warehouseForm.latitude),
        longitude: toNumber(warehouseForm.longitude),
      });
      await postBackend("/masters/warehouses", payload);
      setWarehouseForm({
        code: "",
        name: "",
        street: "",
        city: "",
        state: "",
        pincode: "",
        latitude: "",
        longitude: "",
      });
      setFeedback("Warehouse created.");
      setOpenWarehouse(false);
    } catch (error) {
      setFeedback(`Warehouse create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(null);
    }
  }

  async function createProduct() {
    setSubmitting("product");
    setFeedback("");
    try {
      const payload = cleanPayload({
        sku: productForm.sku,
        name: productForm.name,
        brand_id: productForm.brand_id,
        category_id: productForm.category_id,
        sub_category_id: productForm.sub_category_id,
        description: productForm.description,
        hsn_id: productForm.hsn_id,
        primary_unit_id: productForm.primary_unit_id,
        secondary_unit_id: productForm.secondary_unit_id,
        third_unit_id: productForm.third_unit_id,
        secondary_unit_quantity: toNumber(productForm.secondary_unit_quantity),
        third_unit_quantity: toNumber(productForm.third_unit_quantity),
        weight_in_grams: toNumber(productForm.weight_in_grams),
        base_price: toNumber(productForm.base_price),
        tax_percent: toNumber(productForm.tax_percent),
      });
      await postBackend("/masters/products", payload);
      setProductForm({
        sku: "",
        name: "",
        brand_id: "",
        category_id: "",
        sub_category_id: "",
        description: "",
        hsn_id: "",
        primary_unit_id: "",
        secondary_unit_id: "",
        third_unit_id: "",
        secondary_unit_quantity: "",
        third_unit_quantity: "",
        weight_in_grams: "",
        base_price: "0",
        tax_percent: "0",
      });
      setFeedback("Product created.");
      setOpenProduct(false);
    } catch (error) {
      setFeedback(`Product create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(null);
    }
  }

  async function createCustomer() {
    setSubmitting("customer");
    setFeedback("");
    try {
      const payload = cleanPayload({
        name: customerForm.name,
        outlet_name: customerForm.outlet_name,
        customer_class: customerForm.customer_class,
        route_id: customerForm.route_id,
        route_name: customerForm.route_name,
        gstin: customerForm.gstin,
        owner_name: customerForm.owner_name,
        phone: customerForm.phone,
        email: customerForm.email,
        credit_limit: toNumber(customerForm.credit_limit),
        is_line_sale_outlet: customerForm.is_line_sale_outlet,
      });
      await postBackend("/masters/customers", payload);
      setCustomerForm({
        name: "",
        outlet_name: "",
        customer_class: "B2B_DISTRIBUTOR",
        route_id: "",
        route_name: "",
        gstin: "",
        owner_name: "",
        phone: "",
        email: "",
        credit_limit: "0",
        is_line_sale_outlet: false,
      });
      setFeedback("Customer created.");
      setOpenCustomer(false);
    } catch (error) {
      setFeedback(`Customer create failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Masters</CardTitle>
        <CardDescription>Schema-based create dialogs for areas, routes, warehouses, products, and customers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{feedback}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Dialog open={openArea} onOpenChange={setOpenArea}>
            <DialogTrigger asChild>
              <Button size="sm">Add Area</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Area</DialogTitle>
                <DialogDescription>Fields from `AreaCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label>Area Name *</Label>
                  <Input value={areaForm.area_name} onChange={(e) => setAreaForm((p) => ({ ...p, area_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={areaForm.city} onChange={(e) => setAreaForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input value={areaForm.state} onChange={(e) => setAreaForm((p) => ({ ...p, state: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Pincode</Label>
                  <Input value={areaForm.pincode} onChange={(e) => setAreaForm((p) => ({ ...p, pincode: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input value={areaForm.latitude} onChange={(e) => setAreaForm((p) => ({ ...p, latitude: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input value={areaForm.longitude} onChange={(e) => setAreaForm((p) => ({ ...p, longitude: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createArea} disabled={!areaForm.area_name || submitting === "area"}>
                  {submitting === "area" ? "Creating..." : "Create Area"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openRoute} onOpenChange={setOpenRoute}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Add Route</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Route</DialogTitle>
                <DialogDescription>Fields from `RouteCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Route Name *</Label>
                  <Input value={routeForm.route_name} onChange={(e) => setRouteForm((p) => ({ ...p, route_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Area ID *</Label>
                  <Input value={routeForm.area_id} onChange={(e) => setRouteForm((p) => ({ ...p, area_id: e.target.value }))} placeholder="UUID" />
                  {areas.length > 0 ? (
                    <select
                      className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                      onChange={(e) => setRouteForm((p) => ({ ...p, area_id: e.target.value }))}
                      value={routeForm.area_id}
                    >
                      <option value="">Select area</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.area_name} ({area.id.slice(0, 8)}...)
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createRoute} disabled={!routeForm.route_name || !routeForm.area_id || submitting === "route"}>
                  {submitting === "route" ? "Creating..." : "Create Route"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openWarehouse} onOpenChange={setOpenWarehouse}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Add Warehouse</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Warehouse</DialogTitle>
                <DialogDescription>Fields from `WarehouseCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Code *</Label>
                  <Input value={warehouseForm.code} onChange={(e) => setWarehouseForm((p) => ({ ...p, code: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={warehouseForm.name} onChange={(e) => setWarehouseForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Street</Label>
                  <Input value={warehouseForm.street} onChange={(e) => setWarehouseForm((p) => ({ ...p, street: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={warehouseForm.city} onChange={(e) => setWarehouseForm((p) => ({ ...p, city: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>State</Label>
                  <Input value={warehouseForm.state} onChange={(e) => setWarehouseForm((p) => ({ ...p, state: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Pincode</Label>
                  <Input value={warehouseForm.pincode} onChange={(e) => setWarehouseForm((p) => ({ ...p, pincode: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Latitude</Label>
                  <Input value={warehouseForm.latitude} onChange={(e) => setWarehouseForm((p) => ({ ...p, latitude: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Longitude</Label>
                  <Input value={warehouseForm.longitude} onChange={(e) => setWarehouseForm((p) => ({ ...p, longitude: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createWarehouse} disabled={!warehouseForm.code || !warehouseForm.name || submitting === "warehouse"}>
                  {submitting === "warehouse" ? "Creating..." : "Create Warehouse"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openProduct} onOpenChange={setOpenProduct}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Add Product</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Product</DialogTitle>
                <DialogDescription>Fields from `ProductCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>SKU *</Label>
                  <Input value={productForm.sku} onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Brand ID</Label>
                  <Input value={productForm.brand_id} onChange={(e) => setProductForm((p) => ({ ...p, brand_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>Category ID</Label>
                  <Input value={productForm.category_id} onChange={(e) => setProductForm((p) => ({ ...p, category_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>Sub Category ID</Label>
                  <Input value={productForm.sub_category_id} onChange={(e) => setProductForm((p) => ({ ...p, sub_category_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={productForm.description} onChange={(e) => setProductForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>HSN ID</Label>
                  <Input value={productForm.hsn_id} onChange={(e) => setProductForm((p) => ({ ...p, hsn_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>Primary Unit ID</Label>
                  <Input value={productForm.primary_unit_id} onChange={(e) => setProductForm((p) => ({ ...p, primary_unit_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>Secondary Unit ID</Label>
                  <Input value={productForm.secondary_unit_id} onChange={(e) => setProductForm((p) => ({ ...p, secondary_unit_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>Third Unit ID</Label>
                  <Input value={productForm.third_unit_id} onChange={(e) => setProductForm((p) => ({ ...p, third_unit_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>How many primary units in second unit</Label>
                  <Input
                    value={productForm.secondary_unit_quantity}
                    onChange={(e) => setProductForm((p) => ({ ...p, secondary_unit_quantity: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>How many second units in third unit</Label>
                  <Input value={productForm.third_unit_quantity} onChange={(e) => setProductForm((p) => ({ ...p, third_unit_quantity: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Weight (grams)</Label>
                  <Input value={productForm.weight_in_grams} onChange={(e) => setProductForm((p) => ({ ...p, weight_in_grams: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Base Price *</Label>
                  <Input value={productForm.base_price} onChange={(e) => setProductForm((p) => ({ ...p, base_price: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Tax Percent *</Label>
                  <Input value={productForm.tax_percent} onChange={(e) => setProductForm((p) => ({ ...p, tax_percent: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={createProduct}
                  disabled={!productForm.sku || !productForm.name || !productForm.primary_unit_id || submitting === "product"}
                >
                  {submitting === "product" ? "Creating..." : "Create Product"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={openCustomer} onOpenChange={setOpenCustomer}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">Add Customer</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Customer</DialogTitle>
                <DialogDescription>Fields from `CustomerCreate` schema.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={customerForm.name} onChange={(e) => setCustomerForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Outlet Name</Label>
                  <Input value={customerForm.outlet_name} onChange={(e) => setCustomerForm((p) => ({ ...p, outlet_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Customer Class *</Label>
                  <select
                    className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                    value={customerForm.customer_class}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, customer_class: e.target.value as (typeof customerClassOptions)[number] }))}
                  >
                    {customerClassOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Route ID</Label>
                  <Input value={customerForm.route_id} onChange={(e) => setCustomerForm((p) => ({ ...p, route_id: e.target.value }))} placeholder="UUID" />
                </div>
                <div className="space-y-1">
                  <Label>Route Name</Label>
                  <Input value={customerForm.route_name} onChange={(e) => setCustomerForm((p) => ({ ...p, route_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>GSTIN</Label>
                  <Input value={customerForm.gstin} onChange={(e) => setCustomerForm((p) => ({ ...p, gstin: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Owner Name</Label>
                  <Input value={customerForm.owner_name} onChange={(e) => setCustomerForm((p) => ({ ...p, owner_name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={customerForm.phone} onChange={(e) => setCustomerForm((p) => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input value={customerForm.email} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Credit Limit</Label>
                  <Input value={customerForm.credit_limit} onChange={(e) => setCustomerForm((p) => ({ ...p, credit_limit: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox
                    id="is_line_sale_outlet"
                    checked={customerForm.is_line_sale_outlet}
                    onCheckedChange={(value) => setCustomerForm((p) => ({ ...p, is_line_sale_outlet: value === true }))}
                  />
                  <Label htmlFor="is_line_sale_outlet">Is Line Sale Outlet</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={createCustomer} disabled={!customerForm.name || submitting === "customer"}>
                  {submitting === "customer" ? "Creating..." : "Create Customer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}
