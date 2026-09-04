"""
Cultural Translator Service — translates and adapts sales funnel copy for target countries using GPT-4o.
Not just word-for-word translation: adapts currency, CTAs, local slang, testimonials, and cultural nuance.
"""
from loguru import logger
from openai import AsyncOpenAI
import json
from typing import Dict, Any

from config import settings

client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY) if settings.OPENAI_API_KEY else None

COUNTRY_PROMPTS = {
    "ES-MX": "Use Spanish from Mexico. Adapt CTAs to Mexican sales expressions (ex: '¡Obtenlo hoy!', 'Aprovecha la oferta'). Currency: MXN ($).",
    "ES-CO": "Use Spanish from Colombia. Warm, persuasive tone. Currency: COP ($).",
    "ES-AR": "Use Spanish from Argentina (voseo: vos querés, comprá). Currency: ARS ($).",
    "ES-ES": "Use Spanish from Spain (vosotros, queréis, haz clic). Currency: EUR (€).",
    "EN-US": "Use American English. Direct, high-converting direct-response copywriting style. Currency: USD ($).",
    "EN-GB": "Use British English (spelling: colour, favourite). Professional tone. Currency: GBP (£).",
}


class CulturalTranslator:
    """
    Translates a block JSON structure while preserving block layout and keys.
    """

    async def translate_block(
        self,
        block_props: Dict[str, Any],
        target_country: str = "ES-MX",
    ) -> Dict[str, Any]:
        country_instruction = COUNTRY_PROMPTS.get(
            target_country,
            f"Translate to target country/language: {target_country}."
        )

        prompt = f"""
You are an expert direct-response copywriter adapting sales funnel copy.
{country_instruction}

CRITICAL RULES:
- Translate and culturally adapt headlines, subtitles, button texts, bullet points, and descriptions.
- DO NOT translate image URLs, internal IDs, style properties, or boolean flags.
- Return ONLY valid JSON with the exact same keys as the input.

INPUT PROPS:
{json.dumps(block_props, ensure_ascii=False, indent=2)}
"""

        if not client:
            return block_props

        try:
            resp = await client.chat.completions.create(
                model="gpt-4o",
                max_tokens=1500,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = resp.choices[0].message.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
            translated = json.loads(raw)
            logger.info(f"Block translated to {target_country}")
            return translated

        except Exception as e:
            logger.error(f"Cultural translation failed: {e}")
            return block_props
