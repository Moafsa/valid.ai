import redis.asyncio as aioredis
import json
from config import settings
from typing import Optional, Dict, Any


class ProgressStore:
    """Uses Redis (list + short TTL) to store and stream scan progress events."""

    def __init__(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

    async def push_event(self, job_id: str, event: Dict[str, Any]):
        key = f"scan:progress:{job_id}"
        await self.redis.rpush(key, json.dumps(event))
        await self.redis.expire(key, 3600)

    async def set_meta(self, job_id: str, project_id: str):
        """Which project a job belongs to, so a job orphaned by a restart can be failed properly."""
        await self.redis.set(f"scan:meta:{job_id}", project_id, ex=7200)

    async def orphans(self) -> list:
        """(job_id, project_id) of jobs whose last event is neither done nor error: they were running
        when this process (re)started, and nothing is running them now."""
        out = []
        async for key in self.redis.scan_iter(match="scan:progress:*", count=200):
            job_id = key.split(":", 2)[2]
            last = await self.redis.lindex(key, -1)
            if not last:
                continue
            try:
                status = json.loads(last).get("status")
            except Exception:
                continue
            if status in ("done", "error"):
                continue
            project_id = await self.redis.get(f"scan:meta:{job_id}")
            if project_id:
                out.append((job_id, project_id))
        return out

    async def read_from(self, job_id: str, start: int, count: int = 50) -> list:
        """Events [start, start+count) WITHOUT removing them: a reader that
        drops and reconnects resumes from where it was instead of losing every
        event the dead connection had already taken."""
        raw = await self.redis.lrange(f"scan:progress:{job_id}", start, start + count - 1)
        return [json.loads(r) for r in raw]

    async def get_event(self, job_id: str) -> Optional[Dict[str, Any]]:
        key = f"scan:progress:{job_id}"
        raw = await self.redis.lpop(key)
        return json.loads(raw) if raw else None

    async def close(self):
        await self.redis.aclose()
