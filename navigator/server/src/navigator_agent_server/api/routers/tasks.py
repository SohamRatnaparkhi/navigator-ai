import uuid
import logging
from fastapi import APIRouter, Body
from typing import Dict, Any
from src.navigator_agent_server.services.redis_service import redis_client
from src.navigator_agent_server.services.llm_service import generate_chain_of_thought
from src.navigator_agent_server.api.schemas.tasks import CreateTaskRequest, CreateTaskResponse

router = APIRouter(prefix="/tasks")
logger = logging.getLogger(__name__)

@router.post("/create")
async def create_task(request: CreateTaskRequest = Body(...)) -> CreateTaskResponse:
    task_id = str(uuid.uuid4())
    logger.info(f"Task {task_id} created and stored in Redis")
    cot = generate_chain_of_thought(request.task)
    key = f"task:{task_id}"
    value = cot.model_dump_json()

    await redis_client.set(key, value)
    return CreateTaskResponse(task_id=task_id, chain_of_thought=cot)

@router.post("/update/{task_id}")
async def update_task(task_id: str, update_data: Dict[str, Any] = Body(...)):
    # Placeholder for update logic
    if await redis_client.exists(f"task:{task_id}"):
        await redis_client.hset(f"task:{task_id}", mapping=update_data)
        logger.info(f"Task {task_id} updated")
        return {"status": "updated", "task_id": task_id}
    else:
        logger.warning(f"Task {task_id} not found")
        return {"status": "not found"} 