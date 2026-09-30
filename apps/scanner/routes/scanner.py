from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
from loguru import logger

from services.scan_orchestrator import ScanOrchestrator
from services.progress_store import ProgressStore
from services.asset_uploader import AssetUploader

router = APIRouter()


class ScanRequest(BaseModel):
    job_id: str
    project_id: str
    url: str
    workspace_id: Optional[str] = None


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
        url=request.url, workspace_id=request.workspace_id,
    )
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
async def scan_progress(job_id: str):
    """Server-Sent Events stream for real-time scan progress."""
    store = ProgressStore()

    async def event_generator():
        try:
            while True:
                event = await store.get_event(job_id)
                if event:
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("status") in ("done", "error"):
                        break
                else:
                    await asyncio.sleep(0.5)
        finally:
            await store.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")
