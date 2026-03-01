from typing import Generic, TypeVar

from pydantic import BaseModel


class APIMessage(BaseModel):
    message: str


class PaginationCursor(BaseModel):
    next_cursor: str | None = None


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    total_pages: int
