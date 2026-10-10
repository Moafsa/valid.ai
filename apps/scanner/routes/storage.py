import asyncio
import hmac
import os
import re

from fastapi import APIRouter, Header, HTTPException

from config import settings
from services.asset_uploader import AssetUploader

router = APIRouter()
_ID = re.compile(r"^[A-Za-z0-9_-]{6,64}$")


def _guard(secret: str | None) -> None:
    want = os.environ.get("SCANNER_SHARED_SECRET", "")
    if want and not hmac.compare_digest(secret or "", want):
        raise HTTPException(status_code=403, detail="forbidden")


def _measure(project_id: str) -> tuple[int, int]:
    s3 = AssetUploader().s3
    if not s3:
        return 0, 0
    total = objects = 0
    token = None
    while True:
        kw = {"Bucket": settings.S3_BUCKET_NAME, "Prefix": f"projects/{project_id}/", "MaxKeys": 1000}
        if token:
            kw["ContinuationToken"] = token
        page = s3.list_objects_v2(**kw)
        for o in page.get("Contents", []) or []:
            total += int(o.get("Size", 0))
            objects += 1
        if not page.get("IsTruncated"):
            return total, objects
        token = page.get("NextContinuationToken")


@router.get("/{project_id}")
async def storage(project_id: str, x_scanner_secret: str | None = Header(default=None)):
    """How much is stored for a project (everything the clone hosts: images, fonts, videos). Used by the plan limits of the web app."""
    _guard(x_scanner_secret)
    if not _ID.match(project_id):
        raise HTTPException(status_code=400, detail="bad id")
    try:
        size, objects = await asyncio.to_thread(_measure, project_id)
    except Exception as e:  # the bucket being unreachable must never break a page of the dashboard
        raise HTTPException(status_code=502, detail=str(e)[:120])
    return {"bytes": size, "objects": objects}
