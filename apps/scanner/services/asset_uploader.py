import boto3
import base64
import mimetypes
import httpx
from loguru import logger
from botocore.exceptions import ClientError
from config import settings

_BROWSER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)


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

    async def upload_base64(self, data_b64: str, key: str, content_type: str = "image/png") -> str:
        if not self.s3 or not settings.AWS_ACCESS_KEY_ID:
            logger.warning("S3 not configured, returning placeholder URL")
            return f"https://placeholder.funnelai.com/{key}"
        try:
            data_bytes = base64.b64decode(data_b64)
            self.s3.put_object(
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
                return await self.upload_base64(
                    data_b64=base64.b64encode(bytes(chunks)).decode(), key=key, content_type=content_type,
                )
        except Exception as e:
            logger.warning(f"Failed to rehost asset {source_url}: {e}")
            return None
