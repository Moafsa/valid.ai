import asyncio
import boto3
import base64
import mimetypes
import io
import httpx
from loguru import logger
from botocore.exceptions import ClientError
from config import settings

_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


# Photos are re-encoded on the way in. A clone is opened on phones: a 3000px
# PNG that the original served through a smart CDN would be 2MB here.
MAX_IMG_WIDTH = 1280
WEBP_QUALITY = 80


def optimize_animation(data: bytes) -> tuple[bytes, str] | None:
    """An animated GIF is the heaviest thing a page can carry (10 MB+ for a few seconds of motion). The same
    animation as an animated WebP is a fraction of the size and plays everywhere GIFs do. Frames are
    scaled down to 640px wide (they are decoration, not photos to zoom into); a result that is not
    clearly smaller is thrown away."""
    try:
        from PIL import Image, ImageSequence
    except Exception:
        return None
    try:
        im = Image.open(io.BytesIO(data))
        n = getattr(im, "n_frames", 1)
        if n < 2 or n > 400:
            return None
        k = min(1.0, 640 / max(1, im.width))
        size = (max(1, round(im.width * k)), max(1, round(im.height * k)))
        # a long animation keeps every other frame (twice as long each): the eye does not notice, the file halves
        step = 2 if n > 80 else 1
        frames, durations = [], []
        for i, fr in enumerate(ImageSequence.Iterator(im)):
            d = max(20, int(fr.info.get("duration", 80) or 80))
            if step == 2 and i % 2 == 1:
                if durations:
                    durations[-1] += d
                continue
            durations.append(d)
            f = fr.convert("RGBA")
            frames.append(f.resize(size, Image.LANCZOS) if k < 1.0 else f.copy())
        out = io.BytesIO()
        frames[0].save(out, "WEBP", save_all=True, append_images=frames[1:], duration=durations, loop=im.info.get("loop", 0), quality=60, method=2)
        res = out.getvalue()
        if len(res) < len(data) * 0.8:
            return res, "image/webp"
    except Exception as e:
        logger.debug(f"optimize_animation skipped: {e}")
    return None


def optimize_image(data: bytes, content_type: str) -> tuple[bytes, str] | None:
    """Resizes (never above MAX_IMG_WIDTH) and re-encodes a raster image as
    WebP. Returns None when it is not worth touching: not a plain raster
    (SVG, animated GIF/WebP), already small, or the result is not smaller."""
    if _lab_fast():
        return None
    if content_type == "image/gif" and len(data) >= 250 * 1024:
        return optimize_animation(data)
    if content_type not in ("image/jpeg", "image/png", "image/webp", "image/jpg") or len(data) < 40 * 1024:
        return None
    try:
        from PIL import Image, ImageOps
    except Exception:
        return None
    try:
        im = Image.open(io.BytesIO(data))
        if getattr(im, "is_animated", False):
            return None
        im = ImageOps.exif_transpose(im)
        if im.width > MAX_IMG_WIDTH:
            im = im.resize((MAX_IMG_WIDTH, max(1, round(im.height * MAX_IMG_WIDTH / im.width))), Image.LANCZOS)
        has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
        im = im.convert("RGBA" if has_alpha else "RGB")
        out = io.BytesIO()
        im.save(out, "WEBP", quality=WEBP_QUALITY, method=4)
        res = out.getvalue()
        # keep the original only when re-encoding made it bigger and it was not resized
        if len(res) >= len(data) * 0.95 and im.width == (Image.open(io.BytesIO(data)).width):
            return None
        return res, "image/webp"
    except Exception as e:
        logger.debug(f"optimize_image skipped: {e}")
        return None


def _lab_fast() -> bool:
    """Lab runs (hundreds of sites back to back) skip the CPU-heavy re-encoding; same flag file the orchestrator reads."""
    import os
    return os.path.exists(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".lab_fast"))


def to_woff2(data: bytes) -> bytes | None:
    """A TTF / OTF / WOFF font as WOFF2: the same letters in about a third of the bytes. None when it cannot
    (library missing, a font file we do not understand) or when it would not be smaller."""
    if _lab_fast():
        return None
    try:
        from fontTools.ttLib import TTFont
        import brotli  # noqa: F401  (WOFF2 needs it)
    except Exception:
        return None
    try:
        f = TTFont(io.BytesIO(data))
        if f.flavor == "woff2":
            return None
        f.flavor = "woff2"
        out = io.BytesIO()
        f.save(out)
        res = out.getvalue()
        return res if len(res) < len(data) * 0.9 else None
    except Exception as e:
        logger.debug(f"to_woff2 skipped: {e}")
        return None


_FONT_EXT = (".ttf", ".otf", ".woff")


async def _optimize_bounded(body: bytes, content_type: str):
    """optimize_image off the event loop, and never allowed to hold the scan hostage."""
    try:
        return await asyncio.wait_for(asyncio.to_thread(optimize_image, body, content_type), 75 if content_type == "image/gif" else 30)
    except Exception:
        return None


class AssetUploader:
    """Uploads real assets (images, CSS, fonts) to S3/MinIO so a clone
    never depends on the original site staying up."""

    def __init__(self):
        client_kwargs = dict(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        if settings.AWS_ENDPOINT_URL:
            client_kwargs["endpoint_url"] = settings.AWS_ENDPOINT_URL
        if settings.S3_FORCE_PATH_STYLE:
            from botocore.config import Config as BotoConfig
            client_kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})

        self.s3 = boto3.client("s3", **client_kwargs) if settings.AWS_ACCESS_KEY_ID else None
        # url -> (bytes, content-type) the capture browser already downloaded (see PlaywrightScraper._keep_body)
        self.prefetched: dict[str, tuple[bytes, str]] = {}

    async def upload_base64(self, data_b64: str, key: str, content_type: str = "image/png") -> str:
        if not self.s3 or not settings.AWS_ACCESS_KEY_ID:
            logger.warning("S3 not configured, returning placeholder URL")
            return f"https://placeholder.funnelai.com/{key}"
        try:
            data_bytes = base64.b64decode(data_b64)
            # boto3 is synchronous — off the event loop, so many uploads can
            # genuinely overlap and progress events keep flowing meanwhile.
            await asyncio.to_thread(
                self.s3.put_object,
                Bucket=settings.S3_BUCKET_NAME, Key=key, Body=data_bytes,
                ContentType=content_type, CacheControl="public, max-age=31536000",
            )
            cdn_url = f"{settings.CDN_URL}/{key}"
            logger.info(f"Uploaded to S3: {cdn_url}")
            return cdn_url
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return f"https://placeholder.funnelai.com/{key}"

    async def rehost_url(
        self, source_url: str, key: str, timeout: float = 10, max_bytes: int = 300 * 1024 * 1024,
        referer: str | None = None,
    ) -> str | None:
        """Downloads a real asset (image/font) and re-uploads it to our own
        S3. A plain request with no headers gets 403'd by plenty of
        hotlink-protected CDNs — sending a real browser UA + Referer
        satisfies that same check."""
        if source_url.startswith("data:"):
            return None
        pre = self.prefetched.get(source_url.split("#")[0])
        if pre:
            try:
                body, content_type = pre
                content_type = content_type or mimetypes.guess_type(source_url.split("?")[0])[0] or "application/octet-stream"
                if content_type.startswith("image/"):
                    opt = await _optimize_bounded(body, content_type)
                    if opt:
                        body, content_type = opt
                        key = key.rsplit(".", 1)[0] + ".webp" if "." in key.rsplit("/", 1)[-1] else key + ".webp"
                elif source_url.split("?")[0].lower().endswith(_FONT_EXT):
                    w2 = await asyncio.to_thread(to_woff2, body)
                    if w2:
                        body, content_type = w2, "font/woff2"
                        key = key.rsplit(".", 1)[0] + ".woff2" if "." in key.rsplit("/", 1)[-1] else key + ".woff2"
                return await self.upload_base64(data_b64=base64.b64encode(body).decode(), key=key, content_type=content_type)
            except Exception as e:
                logger.warning(f"Prefetched asset {source_url} could not be re-uploaded ({e}); trying the network")
        headers = {"User-Agent": _BROWSER_USER_AGENT}
        if referer:
            headers["Referer"] = referer
        try:
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=True, headers=headers) as client:
                async with client.stream("GET", source_url) as resp:
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "").split(";")[0].strip()
                    if not content_type:
                        content_type = mimetypes.guess_type(source_url)[0] or "application/octet-stream"
                    chunks = bytearray()
                    async for chunk in resp.aiter_bytes():
                        chunks.extend(chunk)
                        if len(chunks) > max_bytes:
                            logger.warning(f"Asset {source_url} exceeds {max_bytes} bytes, aborting rehost")
                            return None
                body = bytes(chunks)
                if content_type.startswith("image/"):
                    opt = await _optimize_bounded(body, content_type)
                    if opt:
                        body, content_type = opt
                        key = key.rsplit(".", 1)[0] + ".webp" if "." in key.rsplit("/", 1)[-1] else key + ".webp"
                elif source_url.split("?")[0].lower().endswith(_FONT_EXT):
                    w2 = await asyncio.to_thread(to_woff2, body)
                    if w2:
                        body, content_type = w2, "font/woff2"
                        key = key.rsplit(".", 1)[0] + ".woff2" if "." in key.rsplit("/", 1)[-1] else key + ".woff2"
                return await self.upload_base64(
                    data_b64=base64.b64encode(body).decode(), key=key, content_type=content_type,
                )
        except Exception as e:
            logger.warning(f"Failed to rehost asset {source_url}: {e}")
            return None
