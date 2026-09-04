from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://postgres:password@localhost:5432/funnelai"
    REDIS_URL: str = "redis://localhost:6379"

    # ─── AI Providers ─────────────────────────────────────────────────────────
    # Em produção SaaS, estas variáveis são opcionais:
    # as chaves reais são gerenciadas pelo superadmin no banco de dados.
    # Aqui ficam apenas como fallback para desenvolvimento local.
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GEMINI_API_KEY: str = ""
    REPLICATE_API_KEY: str = ""

    # ─── Platform Internal API ────────────────────────────────────────────────
    # URL da aplicação Next.js — para buscar credenciais do superadmin
    WEB_APP_URL: str = "http://web:3000"
    # Token interno para comunicação scanner ↔ web app (sem expor para internet)
    INTERNAL_API_TOKEN: str = "change-this-internal-token-in-production"

    # ─── screenshot-to-code (self-hosted) ────────────────────────────────────
    SCREENSHOT_TO_CODE_URL: str = "http://screenshot-to-code:7001"

    # ─── AWS S3 ───────────────────────────────────────────────────────────────
    # Fallback local — em produção vem do superadmin config
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "us-east-1"
    S3_BUCKET_NAME: str = "funnelai-assets"
    CDN_URL: str = "https://cdn.funnelai.com"

    # ─── Proxy ────────────────────────────────────────────────────────────────
    PROXY_URL: str = ""

    # ─── CORS ─────────────────────────────────────────────────────────────────
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "https://app.funnelai.com"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
