from fastapi import APIRouter, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl
from loguru import logger
from typing import List, Optional, Any
import json
import asyncio

from services.scan_orchestrator import ScanOrchestrator
from services.cloaker_detector import CloakerDetector

router = APIRouter()


class ScanRequest(BaseModel):
    url: str
    project_id: str
    job_id: str
    workspace_id: Optional[str] = None


class CloakerRequest(BaseModel):
    url: str


class QuickAnalyzeRequest(BaseModel):
    url: str


@router.post("/quick-analyze")
async def quick_analyze(request: QuickAnalyzeRequest):
    """
    Pre-clone summary: loads the URL once, counts images/videos/forms/
    buttons/links/scripts, guesses the funnel type, and — since we're
    already asking the user to wait a few seconds here — also runs the
    cloaker check, so "possível mecanismo de entrega diferenciada" shows up
    in the same summary the product doc describes.
    """
    from services.playwright_scraper import PlaywrightScraper

    async with PlaywrightScraper() as scraper:
        counts = await scraper.quick_analyze(request.url)

    cloaker_result = None
    try:
        cloaker_result = await CloakerDetector().analyze(request.url)
    except Exception as e:
        logger.error(f"Cloaker pre-check failed: {e}")

    return {
        **counts,
        "possible_cloaking": bool(cloaker_result and cloaker_result.get("detected")),
        "cloaking_similarity": cloaker_result.get("similarity_ratio") if cloaker_result else None,
    }


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
        workspace_id=request.workspace_id,
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
    from services.html_utils import extract_body_html
    s2c = ScreenshotToCodeClient()
    updated_code = await s2c.update_with_prompt(
        existing_code=request.current_code,
        update_instructions=request.instruction,
        stack="html_tailwind",
    )
    return {"block_id": request.block_id, "code": extract_body_html(updated_code)}


class BlockPayload(BaseModel):
    id: str
    type: str
    order: int = 0
    screenshot: Optional[str] = None
    generatedHtml: Optional[str] = None


class PagePayload(BaseModel):
    name: str
    slug: str
    order: int = 0
    blocks: List[BlockPayload] = []


class TranslateProjectRequest(BaseModel):
    target_country: str
    pages: List[PagePayload]


@router.post("/translate-project")
async def translate_project(request: TranslateProjectRequest):
    """
    Translates the visible text of every block's generatedHtml to the target
    country/language, in parallel. Blocks without generated code (e.g. still
    only a raw screenshot because AI code-gen wasn't configured) pass through
    unchanged — there is no text to translate yet.
    The scanner is stateless: it receives the current pages/blocks and hands
    back translated copies. Persisting them is the caller's job.
    """
    from services.translator import CulturalTranslator
    translator = CulturalTranslator()

    async def translate_block(block: BlockPayload) -> dict:
        html = block.generatedHtml
        translated_html = (
            await translator.translate_html(html, request.target_country)
            if html else html
        )
        return {
            "id": block.id,
            "type": block.type,
            "order": block.order,
            "screenshot": block.screenshot,
            "generatedHtml": translated_html,
        }

    translated_pages = []
    for page in request.pages:
        translated_blocks = await asyncio.gather(*(translate_block(b) for b in page.blocks))
        translated_pages.append({
            "name": page.name,
            "slug": page.slug,
            "order": page.order,
            "blocks": translated_blocks,
        })

    return {"target_country": request.target_country, "pages": translated_pages}


@router.post("/invalidate-cache")
async def invalidate_credentials_cache():
    """
    Invalidates cached AI credentials so new superadmin configs are loaded immediately.
    """
    from services.screenshot_to_code_client import CredentialProvider
    CredentialProvider.invalidate()
    logger.info("AI credentials cache invalidated by superadmin update")
    return {"status": "cache_invalidated"}

