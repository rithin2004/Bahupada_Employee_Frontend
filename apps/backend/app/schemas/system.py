from pydantic import BaseModel


class GoLiveCheckItem(BaseModel):
    name: str
    ok: bool
    detail: str


class GoLiveChecksResponse(BaseModel):
    overall_ready: bool
    checks: list[GoLiveCheckItem]
