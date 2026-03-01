import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class DeliveryMonthlyPlanCreate(BaseModel):
    plan_name: str
    month: int
    year: int


class DeliveryRunOptimizeRequest(BaseModel):
    warehouse_id: uuid.UUID
    run_date: date
    sales_order_ids: list[uuid.UUID]


class DeliveryRunFromReadyRequest(BaseModel):
    warehouse_id: uuid.UUID
    run_date: date
    packing_task_ids: list[uuid.UUID]


class DeliveryAssignTeamRequest(BaseModel):
    delivery_run_id: uuid.UUID
    driver_id: uuid.UUID
    helper_id: uuid.UUID
    bill_manager_id: uuid.UUID
    loader_id: uuid.UUID


class PodCaptureRequest(BaseModel):
    delivery_run_stop_id: uuid.UUID
    status: str
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    note: str | None = None


class DeliveryMonthlyPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_name: str
    month: int
    year: int


class DeliveryAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    delivery_run_id: uuid.UUID
    driver_id: uuid.UUID
    helper_id: uuid.UUID
    bill_manager_id: uuid.UUID
    loader_id: uuid.UUID


class PodEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    delivery_run_stop_id: uuid.UUID
    status: str
    latitude: Decimal | None
    longitude: Decimal | None
    note: str | None


class DeliveryRunOptimizeResponse(BaseModel):
    delivery_run_id: uuid.UUID
    optimized: bool


class ReadyToDispatchItem(BaseModel):
    packing_task_id: uuid.UUID
    sales_order_id: uuid.UUID
    pack_label: str | None = None


class ReadyToDispatchResponse(BaseModel):
    count: int
    items: list[ReadyToDispatchItem]


class DeliveryTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    result: dict | None = None
    error: str | None = None


class DeliveryRunSummaryResponse(BaseModel):
    delivery_run_id: uuid.UUID
    warehouse_id: uuid.UUID
    run_date: date
    optimized: bool
    total_stops: int
    delivered_stops: int
    pending_stops: int
    team_assigned: bool
