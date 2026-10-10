import hmac
import os

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from services import cloaker_probe

router = APIRouter()


class StartRequest(BaseModel):
    url: str


def _guard(secret: str | None) -> None:
    """Only the web app (which has already checked who is asking) may use this: it makes the server fetch an address."""
    want = os.environ.get("SCANNER_SHARED_SECRET", "")
    if want and not hmac.compare_digest(secret or "", want):
        raise HTTPException(status_code=403, detail="forbidden")


@router.post("/start")
async def start(req: StartRequest, x_scanner_secret: str | None = Header(default=None)):
    _guard(x_scanner_secret)
    url = req.url.strip()
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    if not await cloaker_probe.url_is_allowed(url):
        raise HTTPException(status_code=400, detail="Esse endereço não pode ser testado (precisa ser um site público, http ou https).")
    return {"id": cloaker_probe.start(url)}


@router.get("/{job_id}")
async def status(job_id: str, brief: int = 0, x_scanner_secret: str | None = Header(default=None)):
    _guard(x_scanner_secret)
    job = cloaker_probe.JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="not found")
    return cloaker_probe.public(job, brief=bool(brief))
