import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SchemeCreate(BaseModel):
    scheme_name: str
    scheme_type: str
    start_date: date
    end_date: date
    is_active: bool = True


class SchemeProductLinkCreate(BaseModel):
    product_id: uuid.UUID
    free_quantity: Decimal | None = Field(default=None, ge=0)
    discount_percent: Decimal | None = Field(default=None, ge=0, le=100)


class SchemeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scheme_name: str
    scheme_type: str
    start_date: date
    end_date: date
    is_active: bool


class SchemeProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scheme_id: uuid.UUID
    product_id: uuid.UUID
    free_quantity: Decimal | None
    discount_percent: Decimal | None


class SchemeDetailResponse(BaseModel):
    scheme: SchemeOut
    products: list[SchemeProductOut]
