from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger
import sys

from config import settings
from routes import scanner_router, health_router
from workers.scanner_worker import start_worker

# ─── Logging ─────────────────────────────────────────────
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 FunnelAI Scanner Service starting...")
    logger.info(f"   Screenshot-to-code URL: {settings.SCREENSHOT_TO_CODE_URL}")
    yield
    logger.info("Scanner Service shutting down...")


app = FastAPI(
    title="FunnelAI Scanner Service",
    description="Scans, clones and processes marketing funnels using AI",
    version="0.1.0",
    lifespan=lifespan,
)

# ─── CORS ─────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ───────────────────────────────────────────────
app.include_router(health_router, prefix="/health", tags=["health"])
app.include_router(scanner_router, prefix="/api/scanner", tags=["scanner"])
