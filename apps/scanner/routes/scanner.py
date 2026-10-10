import hmac
import os
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
import time
from loguru import logger

from services.scan_orchestrator import ScanOrchestrator
from services.progress_store import ProgressStore
from services.asset_uploader import AssetUploader

def require_secret(x_scanner_secret: Optional[str] = Header(default=None)) -> None:
    """The scanner does work for the web app only (it fetches addresses, stores files): anything else, such as a stranger who finds
    this port through the public address, is turned away. /health stays open."""
    want = os.environ.get("SCANNER_SHARED_SECRET", "")
    if want and not hmac.compare_digest(x_scanner_secret or "", want):
        raise HTTPException(status_code=403, detail="forbidden")


router = APIRouter(dependencies=[Depends(require_secret)])


class ScanRequest(BaseModel):
    job_id: str
    project_id: str
    url: str
    workspace_id: Optional[str] = None
    # clone as a visitor who came from an ad would see the page (ig_ios, ig_android, fb_android, fb_ios, tiktok, google_mobile)
    persona: Optional[str] = None


class UploadAssetRequest(BaseModel):
    data_b64: str
    filename: str
    content_type: Optional[str] = None


@router.post("/start")
async def start_scan(request: ScanRequest, background_tasks: BackgroundTasks):
    """Enqueues a clone job. Returns immediately with job_id — the
    frontend subscribes to /progress/{job_id} via SSE."""
    logger.info(f"Received scan request for URL: {request.url}")
    orchestrator = ScanOrchestrator(
        job_id=request.job_id, project_id=request.project_id,
        url=request.url, workspace_id=request.workspace_id, persona=request.persona,
    )
    await orchestrator.progress.set_meta(request.job_id, request.project_id)
    background_tasks.add_task(orchestrator.run)
    return {"job_id": request.job_id, "project_id": request.project_id, "status": "queued"}


@router.post("/upload-asset")
async def upload_asset(request: UploadAssetRequest):
    """Manual image swap from the visual editor — the browser sends the
    file as base64, we re-host it on our own S3/MinIO the same way cloned
    assets already are, and hand back a stable URL to store on the block."""
    import uuid

    ext = (request.filename.rsplit(".", 1)[-1] if "." in request.filename else "png").lower()[:8]
    key = f"editor-uploads/{uuid.uuid4()}.{ext}"
    url = await AssetUploader().upload_base64(
        data_b64=request.data_b64,
        key=key,
        content_type=request.content_type or "image/png",
    )
    return {"url": url}


@router.get("/progress/{job_id}")
async def scan_progress(job_id: str, request: Request):
    """Server-Sent Events stream for real-time scan progress.

    Events are numbered (`id:`) and never consumed: a browser that reconnects
    sends Last-Event-ID and carries on from there. A comment line goes out
    every few seconds so proxies and clients can tell a quiet scan from a dead
    connection."""
    store = ProgressStore()
    last = request.headers.get("last-event-id") or request.query_params.get("from")
    pos = int(last) + 1 if last and last.lstrip("-").isdigit() and int(last) >= 0 else 0

    async def event_generator():
        nonlocal pos
        try:
            yield ": connected\n\n"
            last_out = time.monotonic()
            while True:
                events = await store.read_from(job_id, pos)
                for event in events:
                    yield f"id: {pos}\ndata: {json.dumps(event)}\n\n"
                    pos += 1
                    last_out = time.monotonic()
                    if event.get("status") in ("done", "error"):
                        return
                if not events:
                    if time.monotonic() - last_out > 10:
                        yield ": ping\n\n"
                        last_out = time.monotonic()
                    if await request.is_disconnected():
                        return
                    await asyncio.sleep(0.5)
        finally:
            await store.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
