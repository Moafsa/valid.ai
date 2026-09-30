from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = ""
    REDIS_URL: str = "redis://redis:6379"

    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    AWS_ENDPOINT_URL: str = ""
    S3_BUCKET_NAME: str = "funnelai-assets"
    S3_FORCE_PATH_STYLE: bool = False
    CDN_URL: str = "https://cdn.funnelai.com"

    PROXY_URL: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
