import boto3
import base64
from loguru import logger
from botocore.exceptions import ClientError
from config import settings
import uuid


class AssetUploader:
    """
    Uploads assets (screenshots, images) to AWS S3.
    Returns CDN URLs.
    """

    def __init__(self):
        client_kwargs = dict(
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_REGION,
        )
        if settings.AWS_ENDPOINT_URL:
            client_kwargs['endpoint_url'] = settings.AWS_ENDPOINT_URL
        if settings.S3_FORCE_PATH_STYLE:
            from botocore.config import Config as BotoConfig
            client_kwargs['config'] = BotoConfig(s3={'addressing_style': 'path'})

        self.s3 = boto3.client('s3', **client_kwargs) if settings.AWS_ACCESS_KEY_ID else None

    async def upload_base64(
        self,
        data_b64: str,
        key: str,
        content_type: str = "image/png"
    ) -> str:
        """
        Uploads a base64-encoded file to S3.
        Returns the CDN URL or a placeholder if S3 not configured.
        """
        if not self.s3 or not settings.AWS_ACCESS_KEY_ID:
            # Return placeholder URL in dev mode
            logger.warning("S3 not configured, returning placeholder URL")
            return f"https://placeholder.funnelai.com/{key}"

        try:
            data_bytes = base64.b64decode(data_b64)

            self.s3.put_object(
                Bucket=settings.S3_BUCKET_NAME,
                Key=key,
                Body=data_bytes,
                ContentType=content_type,
                CacheControl="public, max-age=31536000",
            )

            cdn_url = f"{settings.CDN_URL}/{key}"
            logger.info(f"Uploaded to S3: {cdn_url}")
            return cdn_url

        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return f"https://placeholder.funnelai.com/{key}"
