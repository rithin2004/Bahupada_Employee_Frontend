from fastapi import Query

from app.core.config import settings


def page_query() -> int:
    return Query(1, ge=1)


def page_size_query() -> int:
    return Query(
        settings.pagination_default_page_size,
        ge=1,
        le=settings.pagination_max_page_size,
    )
