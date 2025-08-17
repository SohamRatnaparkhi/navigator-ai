from contextlib import asynccontextmanager
from fastapi import FastAPI
import logging

from .config import REDIS_URL
from .services.redis_service import redis_client
from .api.routers.health import router as health_router
from .api.routers.tasks import router as tasks_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        pong = await redis_client.ping()
        if pong:
            logger.info("Successfully connected to Redis at %s", REDIS_URL)
        else:
            logger.warning("Redis ping failed, but continuing")
    except Exception as e:
        logger.error("Failed to connect to Redis: %s", e)
    yield
    # Shutdown
    await redis_client.aclose()
    logger.info("Disconnected from Redis")

app = FastAPI(lifespan=lifespan)

app.include_router(health_router, prefix="/api/v1")
app.include_router(tasks_router, prefix="/api/v1") 