import uuid
import json
import logging
from fastapi import APIRouter, Body
from typing import Dict, Any
from src.api.schemas.dom import FullDOMData
from src.utils.dom.parser import parse_and_optimize_dom, parse_full_dom
from src.services.redis_service import redis_client
from src.services.llm_service import generate_chain_of_thought
from src.api.schemas.tasks import CreateTaskRequest, CreateTaskResponse

router = APIRouter(prefix="/tasks")
logger = logging.getLogger(__name__)

@router.post("/create")
async def create_task(request: CreateTaskRequest = Body(...)) -> CreateTaskResponse:
    task_id = str(uuid.uuid4())
    logger.info(f"Task {task_id} created and stored in Redis")
    cot = generate_chain_of_thought(request.task, request.url, request.openTabsWithIds, request.currentTab)
    key = f"task:{task_id}"
    value = cot.model_dump_json()

    await redis_client.set(key, value)
    return CreateTaskResponse(task_id=task_id, chain_of_thought=cot)

@router.post("/update")
async def update_task(update_data: Dict[str, Any] = Body(...)):
    # Placeholder for update logic
    task_id = update_data.get("task_id")
    dom_data = update_data.get("dom_data")

    dom_data = FullDOMData(**dom_data)
    # parsed_dom_data, text_content, optimized_dom_data, url_mapping = parse_full_dom(dom_data)
    optimized_dom_data, url_map, parsed_dom_data = parse_and_optimize_dom(
        dom_data)
    # optimized_dom_data, url_mapping = dom_optimizer(parsed_dom_data)

    with open("./parsed-dom.txt", "w") as f:
        f.write(str(parsed_dom_data))

    with open("./optimized-dom.txt", "w") as f:
        f.write(str(optimized_dom_data))

    if await redis_client.exists(f"task:{task_id}"):
        # await redis_client.hset(f"task:{task_id}", mapping=update_data)
        logger.info(f"Task {task_id} updated")
        return {"status": "updated", "task_id": task_id}
    else:
        logger.warning(f"Task {task_id} not found")
        return {"status": "not found"} 