import redis.asyncio as aioredis
import json
from config import settings
from typing import Optional, Dict, Any


class ProgressStore:
    """
    Uses Redis pub/sub + list to store and stream scan progress events.
    """

    def __init__(self):
        self.redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)

    async def push_event(self, job_id: str, event: Dict[str, Any]):
        """Push a progress event to Redis list."""
        key = f"scan:progress:{job_id}"
        await self.redis.rpush(key, json.dumps(event))
        await self.redis.expire(key, 3600)  # 1 hour TTL

    async def get_event(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Pop the next event from the queue (non-blocking)."""
        key = f"scan:progress:{job_id}"
        raw = await self.redis.lpop(key)
        if raw:
            return json.loads(raw)
        return None

    async def close(self):
        await self.redis.aclose()
