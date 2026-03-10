import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict


class SalesmanMonthlyPlanCreate(BaseModel):
    plan_name: str
    month: int
    year: int


class SalesmanMonthlyPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_name: str
    month: int
    year: int


class DeliveryMonthlyPlanCreate(BaseModel):
    plan_name: str
    month: int
    year: int


class DeliveryMonthlyPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    plan_name: str
    month: int
    year: int


class SalesmanDailyAssignmentUpsert(BaseModel):
    duty_date: date
    salesman_id: uuid.UUID
    route_id: uuid.UUID
    note: str | None = None
    is_override: bool = False


class SalesmanDailyAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    monthly_plan_id: uuid.UUID
    duty_date: date
    salesman_id: uuid.UUID
    route_id: uuid.UUID
    note: str | None
    is_override: bool


class DeliveryDailyAssignmentUpsert(BaseModel):
    duty_date: date
    vehicle_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None
    helper_id: uuid.UUID | None = None
    bill_manager_id: uuid.UUID | None = None
    loader_id: uuid.UUID | None = None


class DeliveryDailyAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    monthly_plan_id: uuid.UUID
    duty_date: date
    vehicle_id: uuid.UUID | None
    driver_id: uuid.UUID | None
    helper_id: uuid.UUID | None
    bill_manager_id: uuid.UUID | None
    loader_id: uuid.UUID | None


class DeliveryDailyAssignmentSummary(BaseModel):
    id: uuid.UUID
    monthly_plan_id: uuid.UUID
    duty_date: date
    vehicle_id: uuid.UUID | None = None
    vehicle_name: str | None = None
    registration_no: str | None = None
    capacity_kg: float | None = None
    driver_id: uuid.UUID | None = None
    driver_name: str | None = None
    helper_id: uuid.UUID | None = None
    helper_name: str | None = None
    bill_manager_id: uuid.UUID | None = None
    bill_manager_name: str | None = None
    loader_id: uuid.UUID | None = None
    loader_name: str | None = None
