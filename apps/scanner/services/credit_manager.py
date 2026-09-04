"""
Credit Manager — debita créditos do workspace do usuário após cada operação de IA.
Em modelo SaaS: a plataforma absorve o custo real de tokens e cobra créditos dos usuários.
"""
import httpx
from loguru import logger
from config import settings


# Custo padrão em créditos por operação
# (pode ser sobrescrito pelo superadmin via SystemConfig)
DEFAULT_CREDIT_COSTS = {
    "scan_lp_classify": 3,        # GPT-4o Vision classificação da página
    "scan_section_classify": 1,   # GPT-4o-mini por seção
    "scan_section_s2c": 5,        # screenshot-to-code por seção
    "quiz_step_import": 8,        # importar uma etapa de quiz
    "translate_page": 30,         # traduzir uma página completa
    "cloaker_detect": 10,         # análise de cloaker
    "prompt_edit_block": 5,       # editar bloco via prompt
    "copy_suggestion": 3,         # sugestão de copy
}


class CreditManager:
    """
    Verifica saldo, debita créditos e registra transações.
    Comunica com o web app via API interna.
    """

    def __init__(self, workspace_id: str):
        self.workspace_id = workspace_id
        self.base_url = settings.WEB_APP_URL
        self.headers = {"X-Internal-Token": settings.INTERNAL_API_TOKEN}

    async def check_balance(self) -> int:
        """Retorna o saldo atual de créditos do workspace."""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                resp = await client.get(
                    f"{self.base_url}/api/internal/credits/{self.workspace_id}",
                    headers=self.headers,
                )
                if resp.status_code == 200:
                    return resp.json().get("balance", 0)
        except Exception as e:
            logger.error(f"Error checking credits: {e}")
        return 0

    async def debit(
        self,
        operation: str,
        amount: int,
        description: str,
        project_id: str | None = None,
        model: str | None = None,
        cost_usd: float = 0.0,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> bool:
        """
        Debita créditos do workspace.
        Retorna True se bem-sucedido, False se saldo insuficiente.
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    f"{self.base_url}/api/internal/credits/{self.workspace_id}/debit",
                    headers=self.headers,
                    json={
                        "operation": operation,
                        "amount": amount,
                        "description": description,
                        "project_id": project_id,
                        "model": model,
                        "cost_usd": cost_usd,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    logger.info(
                        f"Debited {amount} credits ({operation}) | "
                        f"balance: {data.get('balance_after')}"
                    )
                    return True
                elif resp.status_code == 402:
                    logger.warning(f"Insufficient credits for workspace {self.workspace_id}")
                    return False
        except Exception as e:
            logger.error(f"Error debiting credits: {e}")
        return False

    async def get_operation_cost(self, operation: str) -> int:
        """
        Busca o custo configurado pelo superadmin para a operação.
        Fallback para os valores padrão.
        """
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get(
                    f"{self.base_url}/api/internal/config/credits_{operation}",
                    headers=self.headers,
                )
                if resp.status_code == 200:
                    return int(resp.json().get("value", DEFAULT_CREDIT_COSTS.get(operation, 5)))
        except Exception:
            pass
        return DEFAULT_CREDIT_COSTS.get(operation, 5)
