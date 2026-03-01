import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class SalesmanVisitCreate(BaseModel):
    salesman_id: uuid.UUID
    customer_id: uuid.UUID
    route_id: uuid.UUID | None = None
    visit_date: date
    status: str = "VISITED"
    latitude: Decimal | None = None
    longitude: Decimal | None = None
    note: str | None = None


class SalesmanVisitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    salesman_id: uuid.UUID
    customer_id: uuid.UUID
    route_id: uuid.UUID | None
    visit_date: date
    status: str
    latitude: Decimal | None
    longitude: Decimal | None
    note: str | None


class SalesmanPerformanceResponse(BaseModel):
    salesman_id: uuid.UUID
    planned_count: int
    visited_count: int
    adherence_percent: Decimal
