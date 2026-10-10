from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from routes.scanner import router as scanner_router
from routes.cloaker import router as cloaker_router
from routes.storage import router as storage_router
from routes.video_upload import router as video_upload_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 be-Vallid Scanner Service starting...")
    # A restart (a deploy, a crash) kills every clone that was running. Tell
    # their owners right away instead of leaving them watching a spinner.
    try:
        from services.progress_store import ProgressStore
        from services.scan_orchestrator import ScanOrchestrator
        store = ProgressStore()
        for job_id, project_id in await store.orphans():
            logger.warning(f"Failing orphaned job {job_id} (scanner restarted while it was running)")
            orch = ScanOrchestrator(job_id=job_id, project_id=project_id, url="")
            await orch._fail("O scanner foi reiniciado enquanto clonava. É só tentar de novo.")
        await store.close()
    except Exception as e:
        logger.warning(f"Orphan check failed (non-fatal): {e!r}")
    yield


app = FastAPI(title="be-Vallid Scanner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scanner_router, prefix="/api/scanner", tags=["scanner"])
app.include_router(cloaker_router, prefix="/api/cloaker", tags=["cloaker"])
app.include_router(storage_router, prefix="/api/storage", tags=["storage"])
app.include_router(video_upload_router, prefix="/api/video", tags=["video"])


@app.get("/health")
async def health():
    return {"status": "ok"}
