from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.router import api_router
from app.core.config import settings


def _cors_allow_origins() -> list[str]:
    """
    Browsers reject Access-Control-Allow-Origin: * together with credentials.
    When CORS_ALLOW_ORIGINS is '*', expand to common local dev origins so cookies / auth headers work.
    In production, set CORS_ALLOW_ORIGINS to a comma-separated list (e.g. https://employee.example.com).
    """
    raw = settings.cors_allow_origins.strip()
    if raw == "*":
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ]
    return [o.strip() for o in raw.split(",") if o.strip()]


app = FastAPI(title=settings.app_name)
if settings.gzip_enabled:
    app.add_middleware(GZipMiddleware, minimum_size=settings.gzip_minimum_size_bytes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
