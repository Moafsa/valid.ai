import asyncio
import json
import base64
from typing import Optional, Literal
from loguru import logger
import websockets
import httpx

from config import settings

Stack = Literal["react_tailwind", "html_tailwind", "bootstrap", "vue_tailwind"]


class CredentialProvider:
    """
    Fetches AI credentials from the FunnelAI web app (superadmin config).
    Caches them in memory for 5 minutes to avoid repeated DB calls.
    In SaaS model: platform owner sets the keys, all users share them.
    """

    _cache: dict = {}
    _cache_at: float = 0
    _cache_ttl: float = 300  # 5 minutes

    @classmethod
    async def get(cls) -> dict:
        import time
        if cls._cache and (time.time() - cls._cache_at) < cls._cache_ttl:
            return cls._cache

        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{settings.WEB_APP_URL}/api/internal/ai-credentials",
                    headers={"X-Internal-Token": settings.INTERNAL_API_TOKEN},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    cls._cache = data
                    cls._cache_at = time.time()
                    logger.info("AI credentials loaded from platform config")
                    return cls._cache
        except Exception as e:
            logger.warning(f"Could not fetch AI credentials from platform: {e}")

        # Fallback to env vars (dev/local mode)
        return {
            "openai": settings.OPENAI_API_KEY,
            "anthropic": settings.ANTHROPIC_API_KEY,
            "gemini": settings.GEMINI_API_KEY,
            "replicate": settings.REPLICATE_API_KEY,
        }

    @classmethod
    def invalidate(cls):
        cls._cache = {}
        cls._cache_at = 0


class ScreenshotToCodeClient:
    """
    Client for the self-hosted screenshot-to-code service.
    Communicates via WebSocket (streaming code generation).
    AI credentials are fetched from the superadmin platform config.
    """

    def __init__(self):
        base = settings.SCREENSHOT_TO_CODE_URL
        self.ws_url = base.replace("http://", "ws://").replace("https://", "wss://")
        self.ws_url = f"{self.ws_url}/generate-code"

    async def _build_params(self, stack: Stack) -> dict:
        """
        Build WebSocket params with platform-managed AI credentials.

        The field is "generatedCodeConfig", not "stack" — the vendored
        screenshot-to-code service (apps/scanner's git-cloned fork, see
        backend/routes/generate_code.py::extract_and_validate) reads
        params["generatedCodeConfig"] and rejects anything else with
        "Invalid generated code config: ", which is exactly the error this
        integration threw on every single call before this fix — regardless
        of how valid the AI key was.
        """
        creds = await CredentialProvider.get()
        params: dict = {
            "generatedCodeConfig": stack,
            "isImageGenerationEnabled": False,
        }
        if creds.get("openai"):
            params["openAiApiKey"] = creds["openai"]
        if creds.get("anthropic"):
            params["anthropicApiKey"] = creds["anthropic"]
        if creds.get("gemini"):
            params["geminiApiKey"] = creds["gemini"]
        if creds.get("replicate"):
            params["replicateApiKey"] = creds["replicate"]
        return params

    async def _run(self, params: dict, max_retries: int = 1) -> str:
        """
        Sends one generation request and collects variant 0's final code.
        "setCode" is NOT a one-shot final message here — the agent streams
        the whole file again on every internal step (grows-then-settles,
        not a token delta like "chunk"), so the value keeps getting
        overwritten as more messages arrive; only "variantComplete" (or the
        socket closing) means it's truly done. A top-level "error" (invalid
        params, no API key, etc.) has no variantIndex and always aborts
        immediately; a lone "variantError" for variant 0 does too — the
        other variants running concurrently server-side are ignored either way.
        """
        logger.info(f"Connecting to screenshot-to-code: {self.ws_url}")
        last_error: Optional[Exception] = None

        for attempt in range(max_retries):
            generated_code = ""
            try:
                async with websockets.connect(
                    self.ws_url,
                    ping_interval=30,
                    ping_timeout=60,
                    open_timeout=15,
                ) as ws:
                    await ws.send(json.dumps(params))
                    async for message in ws:
                        data = json.loads(message)
                        msg_type = data.get("type", "")
                        variant_index = data.get("variantIndex")

                        if msg_type == "error":
                            raise RuntimeError(f"screenshot-to-code error: {data.get('value')}")

                        if variant_index not in (0, None):
                            continue  # another variant — not the one we keep

                        if msg_type == "chunk":
                            generated_code += data.get("value", "")
                        elif msg_type == "setCode":
                            generated_code = data.get("value", generated_code)
                        elif msg_type == "variantError":
                            raise RuntimeError(f"screenshot-to-code variant failed: {data.get('value')}")
                        elif msg_type == "variantComplete":
                            break  # variant 0 finished — its last setCode is the final code
                        elif msg_type == "status":
                            logger.debug(f"S2C status: {data.get('value')}")

                if generated_code:
                    logger.info(f"Code generated: {len(generated_code)} chars")
                    return generated_code
                raise RuntimeError("screenshot-to-code closed the connection without returning code")

            except (ConnectionRefusedError, OSError) as e:
                last_error = e
                logger.warning(f"Attempt {attempt+1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(2 ** attempt)

        raise RuntimeError(f"screenshot-to-code service unavailable after {max_retries} attempts: {last_error}")

    async def screenshot_to_react(
        self,
        screenshot_b64: str,
        stack: Stack = "html_tailwind",
        prompt_hint: Optional[str] = None,
    ) -> str:
        image_url = f"data:image/png;base64,{screenshot_b64}"
        params = await self._build_params(stack)
        params.update({
            "generationType": "create",
            "inputMode": "image",
            "prompt": {
                "text": prompt_hint or "",
                "images": [image_url],
                "videos": [],
            },
        })
        return await self._run(params, max_retries=3)

    async def update_with_prompt(
        self,
        existing_code: str,
        update_instructions: str,
        screenshot_b64: Optional[str] = None,
        stack: Stack = "html_tailwind",
    ) -> str:
        params = await self._build_params(stack)
        params.update({
            "generationType": "update",
            "inputMode": "image" if screenshot_b64 else "text",
            "prompt": {
                "text": update_instructions,
                "images": [f"data:image/png;base64,{screenshot_b64}"] if screenshot_b64 else [],
                "videos": [],
            },
            "fileState": {"path": "index.html", "content": existing_code},
        })
        return await self._run(params)
