import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class AttendanceMark(BaseModel):
    employee_id: uuid.UUID
    attendance_date: date
    is_active_for_shift: bool


class AutoAssignmentRequest(BaseModel):
    warehouse_id: uuid.UUID
    attendance_date: date


class PackingTaskStatusUpdate(BaseModel):
    status: str
    pack_label: str | None = None
    invoice_written_on_pack: bool | None = None


class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    attendance_date: date
    is_active_for_shift: bool


class PackingTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sales_order_id: uuid.UUID
    warehouse_id: uuid.UUID
    assigned_packer_id: uuid.UUID | None
    assigned_supervisor_id: uuid.UUID | None
    status: str
    pack_label: str | None
    invoice_written_on_pack: bool


class PackingAutoAssignResponse(BaseModel):
    tasks_assigned: int


class ReadyToDispatchDashboardItem(BaseModel):
    packing_task_id: uuid.UUID
    sales_order_id: uuid.UUID
    warehouse_id: uuid.UUID
    status: str
    pack_label: str | None
    invoice_written_on_pack: bool


class ReadyToDispatchDashboardResponse(BaseModel):
    count: int
    items: list[ReadyToDispatchDashboardItem]
