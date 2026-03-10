import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field


class InvoiceBatchAssignRequest(BaseModel):
    sales_final_invoice_ids: list[uuid.UUID] = Field(min_length=1)


class InvoiceBatchAssignResponse(BaseModel):
    batch_id: uuid.UUID
    batch_code: str
    status: str
    invoice_count: int


class InvoiceExecutionItemIn(BaseModel):
    sales_final_invoice_item_id: uuid.UUID
    actual_quantity: Decimal
    shortfall_reason: str | None = None


class InvoiceExecutionUpdateRequest(BaseModel):
    items: list[InvoiceExecutionItemIn]


class InvoicePackingOutputRequest(BaseModel):
    total_boxes_or_bags: int = Field(ge=0)
    loose_cases: int = Field(ge=0)
    full_cases: int = Field(ge=0)
    packing_note: str | None = None


class InvoiceSupervisorDecisionRequest(BaseModel):
    note: str | None = None


class NotificationReadRequest(BaseModel):
    notification_ids: list[uuid.UUID] | None = None


class WorkflowInvoiceItemResponse(BaseModel):
    execution_item_id: uuid.UUID | None = None
    sales_final_invoice_item_id: uuid.UUID
    product_id: uuid.UUID
    sku: str
    product_name: str
    unit: str
    mrp: Decimal | None = None
    quantity: Decimal
    actual_quantity: Decimal
    shortfall_quantity: Decimal
    shortfall_reason: str | None = None
    supervisor_decision: str | None = None
    supervisor_note: str | None = None
    case_size: Decimal | None = None


class WorkflowInvoiceResponse(BaseModel):
    batch_invoice_id: uuid.UUID
    sales_final_invoice_id: uuid.UUID
    invoice_number: str
    invoice_date: date
    customer_id: uuid.UUID
    customer_name: str
    warehouse_id: uuid.UUID
    warehouse_name: str
    assigned_packer_id: uuid.UUID
    assigned_packer_name: str
    assigned_supervisor_id: uuid.UUID
    assigned_supervisor_name: str
    total_weight_grams: Decimal
    total_amount: Decimal
    status: str
    requested_verification_at: str | None = None
    verified_at: str | None = None
    rejected_at: str | None = None
    rejection_note: str | None = None
    ready_for_dispatch_at: str | None = None
    total_boxes_or_bags: int | None = None
    loose_cases: int | None = None
    full_cases: int | None = None
    packing_note: str | None = None
    items: list[WorkflowInvoiceItemResponse]


class WorkflowBatchResponse(BaseModel):
    batch_id: uuid.UUID
    batch_code: str
    warehouse_id: uuid.UUID
    warehouse_name: str
    status: str
    created_at: str
    invoice_count: int
    invoices: list[WorkflowInvoiceResponse] | None = None


class NotificationResponse(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    message: str
    entity_type: str | None = None
    entity_id: uuid.UUID | None = None
    is_read: bool
    created_at: str
    read_at: str | None = None


class DeliveryRunAllocateRequest(BaseModel):
    sales_final_invoice_ids: list[uuid.UUID] = Field(min_length=1)
    delivery_date: date
    vehicle_id: uuid.UUID


class InvoiceDocumentUpdateRequest(BaseModel):
    e_invoice_number: str | None = None
    gst_invoice_number: str | None = None
    eway_bill_number: str | None = None


class DeliveryRunStopActionRequest(BaseModel):
    note: str | None = None
    failure_reason: str | None = None


class DeliveryRunVehicleOptionResponse(BaseModel):
    assignment_id: uuid.UUID
    vehicle_id: uuid.UUID
    vehicle_name: str
    registration_no: str
    capacity_kg: Decimal | None = None
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    in_vehicle_employee_id: uuid.UUID | None = None
    in_vehicle_employee_name: str | None = None
    bill_manager_id: uuid.UUID | None = None
    bill_manager_name: str | None = None
    loader_id: uuid.UUID | None = None
    loader_name: str | None = None


class DeliveryRunStopResponse(BaseModel):
    stop_id: uuid.UUID
    sales_final_invoice_id: uuid.UUID
    invoice_number: str
    customer_id: uuid.UUID
    customer_name: str
    total_amount: Decimal
    total_weight_grams: Decimal
    status: str
    sequence_no: int | None = None
    loading_sequence_no: int | None = None
    distance_meters: Decimal | None = None
    duration_seconds: int | None = None
    e_invoice_number: str | None = None
    gst_invoice_number: str | None = None
    eway_bill_number: str | None = None
    customer_latitude: Decimal | None = None
    customer_longitude: Decimal | None = None
    total_boxes_or_bags: int | None = None
    loose_cases: int | None = None
    full_cases: int | None = None
    packing_note: str | None = None
    items: list[WorkflowInvoiceItemResponse] | None = None


class DeliveryRunResponse(BaseModel):
    run_id: uuid.UUID
    warehouse_id: uuid.UUID
    warehouse_name: str
    delivery_date: date
    vehicle_id: uuid.UUID | None = None
    vehicle_name: str | None = None
    registration_no: str | None = None
    capacity_kg: Decimal | None = None
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    in_vehicle_employee_id: uuid.UUID | None = None
    in_vehicle_employee_name: str | None = None
    bill_manager_id: uuid.UUID | None = None
    bill_manager_name: str | None = None
    loader_id: uuid.UUID | None = None
    loader_name: str | None = None
    status: str
    total_weight_grams: Decimal
    optimized: bool
    route_provider: str | None = None
    google_maps_url: str | None = None
    total_duration_seconds: int | None = None
    route_generated_at: str | None = None
    loading_completed_at: str | None = None
    delivery_started_at: str | None = None
    created_at: str
    source_batch_ids: list[uuid.UUID]
    stops: list[DeliveryRunStopResponse] | None = None
