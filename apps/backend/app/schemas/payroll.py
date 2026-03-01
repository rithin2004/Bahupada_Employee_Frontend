import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SalaryCreate(BaseModel):
    employee_id: uuid.UUID
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=3000)
    basic: Decimal = Decimal("0")
    allowance: Decimal = Decimal("0")
    deductions: Decimal = Decimal("0")


class SalaryRunRequest(BaseModel):
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=3000)
    warehouse_id: uuid.UUID | None = None


class SalaryMarkPaidRequest(BaseModel):
    paid_status: str = "PAID"


class SalaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    employee_id: uuid.UUID
    basic: Decimal
    allowance: Decimal
    deductions: Decimal
    net_salary: Decimal
    month: int
    year: int
    paid_status: str


class SalaryRunResponse(BaseModel):
    created_count: int
