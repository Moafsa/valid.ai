"""
Videos the owner uploads in the editor. The browser sends the file straight here (it can be large, so it does not go through the web app),
with a short-lived signed token the web app handed out for ONE project. The file is cut into the same light HLS pieces cloned videos use,
stored with the project, and the editor gets the playlist address to put in a player.
"""
import asyncio
import base64
import hashlib
import hmac
import json
import os
import shutil
import tempfile
import time
import uuid

from fastapi import APIRouter, HTTPException, Request
from loguru import logger

from services.asset_uploader import AssetUploader
from services.video_processor import VideoProcessor

router = APIRouter()

MAX_UPLOAD_BYTES = 2 * 1024 ** 3
JOB_TTL = 3 * 3600
JOBS: dict[str, dict] = {}
_ffmpeg_slots = asyncio.Semaphore(2)


def _secret() -> str:
    return os.environ.get("SCANNER_SHARED_SECRET", "")


def verify_token(token: str) -> dict:
    """The token is `<base64url json>.<hmac sha256 hex>`; the json carries workspace (w), project (p) and expiry (exp)."""
    try:
        body, sig = token.rsplit(".", 1)
        want = hmac.new(_secret().encode(), body.encode(), hashlib.sha256).hexdigest()
        if not _secret() or not hmac.compare_digest(sig, want):
            raise ValueError("bad signature")
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if int(data["exp"]) < time.time() or not data.get("w") or not data.get("p"):
            raise ValueError("expired")
        return data
    except Exception:
        raise HTTPException(status_code=401, detail="Sessão de envio expirada. Tente de novo.")


def _sweep() -> None:
    now = time.time()
    for k in [k for k, j in JOBS.items() if now - j["at"] > JOB_TTL]:
        JOBS.pop(k, None)


async def _run(job_id: str, work: str, src: str, project_id: str) -> None:
    job = JOBS[job_id]
    try:
        job["stage"] = "waiting"
        async with _ffmpeg_slots:
            job["stage"] = "converting"
            res = await VideoProcessor(AssetUploader(), project_id).from_file(src, f"projects/{project_id}/videos/up-{job_id}")
        if not res:
            job.update(status="error", error="Não consegui ler esse arquivo como vídeo. Tente um .mp4, .mov ou .webm.")
            return
        job.update(status="done", result=res)
    except Exception as e:
        logger.warning(f"editor video upload failed: {e!r}")
        job.update(status="error", error="Algo deu errado ao preparar o vídeo. Tente de novo.")
    finally:
        shutil.rmtree(work, ignore_errors=True)


@router.post("/upload")
async def upload(request: Request, token: str, filename: str = "video"):
    t = verify_token(token)
    _sweep()
    if sum(1 for j in JOBS.values() if j["w"] == t["w"] and j["status"] == "running") >= 2:
        raise HTTPException(status_code=429, detail="Já tem vídeos sendo preparados. Espere terminar para enviar outro.")
    declared = int(request.headers.get("content-length") or 0)
    if declared > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Vídeo grande demais (máximo 2 GB).")
    work = tempfile.mkdtemp(prefix="vai_upload_")
    src = os.path.join(work, "source")
    got = 0
    try:
        with open(src, "wb") as f:
            async for chunk in request.stream():
                got += len(chunk)
                if got > MAX_UPLOAD_BYTES:
                    raise HTTPException(status_code=413, detail="Vídeo grande demais (máximo 2 GB).")
                f.write(chunk)
    except HTTPException:
        shutil.rmtree(work, ignore_errors=True)
        raise
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise HTTPException(status_code=400, detail="O envio foi interrompido. Tente de novo.")
    if got == 0:
        shutil.rmtree(work, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Arquivo vazio.")
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"w": t["w"], "p": t["p"], "status": "running", "stage": "waiting", "at": time.time(), "name": filename[:120]}
    asyncio.create_task(_run(job_id, work, src, t["p"]))
    return {"job_id": job_id}


@router.get("/job/{job_id}")
async def job_status(job_id: str, token: str):
    t = verify_token(token)
    job = JOBS.get(job_id)
    if not job or job["w"] != t["w"]:
        raise HTTPException(status_code=404, detail="Envio não encontrado.")
    return {k: job.get(k) for k in ("status", "stage", "error", "result")}
