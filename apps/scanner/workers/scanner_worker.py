from loguru import logger


async def start_worker():
    """Background worker entrypoint if needed."""
    logger.info("Scanner worker initialized.")
