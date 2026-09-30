from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from routes.scanner import router as scanner_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 be-Vallid Scanner Service starting...")
    yield


app = FastAPI(title="be-Vallid Scanner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scanner_router, prefix="/api/scanner", tags=["scanner"])


@app.get("/health")
async def health():
    return {"status": "ok"}
