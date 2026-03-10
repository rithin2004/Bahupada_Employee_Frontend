import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SchemeCreate(BaseModel):
    scheme_name: str = Field(min_length=1, max_length=200)
    customer_category_id: uuid.UUID
    condition_basis: str = Field(pattern="^(VALUE|WEIGHT|QUANTITY)$")
    threshold_value: Decimal = Field(gt=0)
    threshold_unit: str = Field(pattern="^(INR|GM|KG|PIECE)$")
    brand: str | None = None
    category: str | None = None
    sub_category: str | None = None
    product_id: uuid.UUID | None = None
    reward_type: str = Field(pattern="^(DISCOUNT|FREE_ITEM)$")
    reward_discount_percent: Decimal | None = Field(default=None, gt=0, le=100)
    reward_product_id: uuid.UUID | None = None
    reward_product_quantity: Decimal | None = Field(default=None, gt=0)
    note: str | None = None
    start_date: date
    end_date: date
    is_active: bool = True

    @model_validator(mode="after")
    def validate_business_rules(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")

        allowed_units = {
            "VALUE": {"INR"},
            "WEIGHT": {"GM", "KG"},
            "QUANTITY": {"PIECE"},
        }
        if self.threshold_unit not in allowed_units[self.condition_basis]:
            raise ValueError("threshold_unit is invalid for the selected condition_basis")

        if self.reward_type == "DISCOUNT":
            if self.reward_discount_percent is None:
                raise ValueError("reward_discount_percent is required for discount schemes")
            if self.reward_product_id is not None or self.reward_product_quantity is not None:
                raise ValueError("free item fields are not allowed for discount schemes")
        else:
            if self.reward_product_id is None or self.reward_product_quantity is None:
                raise ValueError("reward_product_id and reward_product_quantity are required for free item schemes")
            if self.reward_discount_percent is not None:
                raise ValueError("reward_discount_percent is not allowed for free item schemes")

        if self.brand is None and any([self.category, self.sub_category, self.product_id]):
            raise ValueError("brand must be selected before category, sub_category, or product")
        if self.category is None and any([self.sub_category, self.product_id]):
            raise ValueError("category must be selected before sub_category or product")
        if self.sub_category is None and self.product_id is not None:
            raise ValueError("sub_category must be selected before product")

        return self


class SchemeUpdate(BaseModel):
    scheme_name: str | None = Field(default=None, min_length=1, max_length=200)
    customer_category_id: uuid.UUID | None = None
    condition_basis: str | None = Field(default=None, pattern="^(VALUE|WEIGHT|QUANTITY)$")
    threshold_value: Decimal | None = Field(default=None, gt=0)
    threshold_unit: str | None = Field(default=None, pattern="^(INR|GM|KG|PIECE)$")
    brand: str | None = None
    category: str | None = None
    sub_category: str | None = None
    product_id: uuid.UUID | None = None
    reward_type: str | None = Field(default=None, pattern="^(DISCOUNT|FREE_ITEM)$")
    reward_discount_percent: Decimal | None = Field(default=None, gt=0, le=100)
    reward_product_id: uuid.UUID | None = None
    reward_product_quantity: Decimal | None = Field(default=None, gt=0)
    note: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None


class SchemeScopeMeta(BaseModel):
    brands: list[str]
    categories: list[str]
    sub_categories: list[str]


class SchemeProductOption(BaseModel):
    id: uuid.UUID
    sku: str
    name: str
    display_name: str | None
    brand: str | None
    category: str | None
    sub_category: str | None


class SchemeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    scheme_name: str
    customer_category_id: uuid.UUID
    customer_category_name: str
    condition_basis: str
    threshold_value: Decimal
    threshold_unit: str
    brand: str | None
    category: str | None
    sub_category: str | None
    product_id: uuid.UUID | None
    product_name: str | None
    reward_type: str
    reward_discount_percent: Decimal | None
    reward_product_id: uuid.UUID | None
    reward_product_name: str | None
    reward_product_quantity: Decimal | None
    note: str | None
    start_date: date
    end_date: date
    is_active: bool

