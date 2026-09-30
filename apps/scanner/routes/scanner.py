from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import asyncio
import json
from loguru import logger

from services.scan_orchestrator import ScanOrchestrator
from services.progress_store import ProgressStore

router = APIRouter()


class ScanRequest(BaseModel):
    job_id: str
    project_id: str
    url: str
    workspace_id: Optional[str] = None


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
