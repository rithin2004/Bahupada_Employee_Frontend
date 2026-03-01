import asyncio
import re
import uuid
from datetime import datetime
from pathlib import Path

import boto3
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings


_MAX_FILE_BYTES = 10 * 1024 * 1024


def _sanitize_filename(name: str) -> str:
    base = Path(name).name
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return safe or "document.pdf"


def _build_object_key(doc_type: str, file_name: str) -> str:
    now = datetime.utcnow()
    stamp = now.strftime("%Y%m%d")
    unique = uuid.uuid4().hex[:10]
    return f"{settings.s3_docs_prefix}/{doc_type}/{stamp}/{unique}-{file_name}"


def _create_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        endpoint_url=settings.s3_endpoint_url,
    )


async def upload_customer_doc(file: UploadFile, doc_type: str) -> tuple[str, str | None]:
    if not settings.s3_bucket_name:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="S3_BUCKET_NAME is not configured",
        )

    content_type = (file.content_type or "").lower()
    if content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF files are allowed")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(data) > _MAX_FILE_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File too large. Max 10MB")

    file_name = _sanitize_filename(file.filename or "document.pdf")
    if not file_name.lower().endswith(".pdf"):
        file_name = f"{file_name}.pdf"
    object_key = _build_object_key(doc_type, file_name)

    client = _create_s3_client()

    try:
        await asyncio.to_thread(
            client.put_object,
            Bucket=settings.s3_bucket_name,
            Key=object_key,
            Body=data,
            ContentType="application/pdf",
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"S3 upload failed: {exc}") from exc

    public_url: str | None = None
    if settings.aws_region and not settings.s3_endpoint_url:
        public_url = f"https://{settings.s3_bucket_name}.s3.{settings.aws_region}.amazonaws.com/{object_key}"

    return object_key, public_url
