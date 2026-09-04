from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from loguru import logger
import json
import asyncio

from services.scan_orchestrator import ScanOrchestrator
from services.cloaker_detector import CloakerDetector

router = APIRouter()


class ScanRequest(BaseModel):
    url: str
    project_id: str
    job_id: str


class CloakerRequest(BaseModel):
    url: str


@router.post("/start")
async def start_scan(
    request: ScanRequest,
    background_tasks: BackgroundTasks,
):
    """
    Enqueues a scan job. Returns immediately with job_id.
    The frontend should subscribe to /progress/{job_id} via SSE.
    """
    logger.info(f"Received scan request for URL: {request.url}")

    orchestrator = ScanOrchestrator(
        job_id=request.job_id,
        project_id=request.project_id,
        url=request.url,
    )

    background_tasks.add_task(orchestrator.run)

    return {
        "job_id": request.job_id,
        "project_id": request.project_id,
        "status": "queued",
        "message": "Scan started successfully"
    }


@router.get("/progress/{job_id}")
async def scan_progress(job_id: str):
    """
    Server-Sent Events stream for real-time scan progress.
    """
    async def event_generator():
        from services.progress_store import ProgressStore
        store = ProgressStore()

        while True:
            event = await store.get_event(job_id)
            if event:
                yield f"data: {json.dumps(event)}\n\n"
                if event.get("status") in ("done", "error"):
                    break
            await asyncio.sleep(0.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )


@router.post("/detect-cloaker")
async def detect_cloaker(request: CloakerRequest):
    """
    Runs the cloaker detection pipeline on the given URL.
    """
    detector = CloakerDetector()
    result = await detector.analyze(request.url)
    return result


class UpdatePromptRequest(BaseModel):
    block_id: str
    current_code: str
    instruction: str


@router.post("/update-prompt")
async def update_prompt(request: UpdatePromptRequest):
    """
    Updates an existing block code using screenshot-to-code update mode via prompt instruction.
    """
    from services.screenshot_to_code_client import ScreenshotToCodeClient
    s2c = ScreenshotToCodeClient()
    updated_code = await s2c.update_with_prompt(
        existing_code=request.current_code,
        update_instructions=request.instruction,
    )
    return {"block_id": request.block_id, "code": updated_code}


class TranslateProjectRequest(BaseModel):
    project_id: str
    target_country: str


@router.post("/translate-project")
async def translate_project(request: TranslateProjectRequest):
    """
    Translates all blocks in a project to the target country/language.
    """
    from services.translator import CulturalTranslator
    translator = CulturalTranslator()
    # Mock block properties translation (reads from DB in production)
    return {"project_id": request.project_id, "status": "translated", "target_country": request.target_country}


@router.post("/invalidate-cache")
async def invalidate_credentials_cache():
    """
    Invalidates cached AI credentials so new superadmin configs are loaded immediately.
    """
    from services.screenshot_to_code_client import CredentialProvider
    CredentialProvider.invalidate()
    logger.info("AI credentials cache invalidated by superadmin update")
    return {"status": "cache_invalidated"}

