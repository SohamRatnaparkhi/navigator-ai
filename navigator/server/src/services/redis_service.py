import json
from typing import Any, Dict, List, Optional

import redis.asyncio as redis

from src.config import REDIS_URL

redis_client = redis.from_url(REDIS_URL, decode_responses=True)


def _task_key(task_id: str) -> str:
    return f"task:{task_id}"


async def get_task_goal(task_id: str) -> Optional[str]:
    key = _task_key(task_id)
    raw = await redis_client.get(key)
    if not raw:
        return None
    try:
        obj = json.loads(raw)
        return obj.get("task") or obj.get("goal") or obj.get("query")
    except Exception:
        return raw


async def get_action_history(task_id: str) -> List[Dict[str, Any]]:
    key = _task_key(task_id) + ":action_history"
    items = await redis_client.lrange(key, 0, -1)
    out: List[Dict[str, Any]] = []
    for it in items or []:
        try:
            out.append(json.loads(it))
        except Exception:
            continue
    return out


async def append_action_history(task_id: str, action: Dict[str, Any]) -> None:
    key = _task_key(task_id) + ":action_history"
    await redis_client.rpush(key, json.dumps(action))


async def append_execution_log(task_id: str, entry: Dict[str, Any]) -> None:
    key = _task_key(task_id) + ":execution_log"
    await redis_client.rpush(key, json.dumps(entry))


async def set_scratchpad(task_id: str, content: str) -> None:
    key = _task_key(task_id) + ":scratchpad"
    await redis_client.set(key, content)


async def get_scratchpad(task_id: str) -> str:
    key = _task_key(task_id) + ":scratchpad"
    return await redis_client.get(key) or ""


async def get_todo_list(task_id: str) -> List[Dict[str, Any]]:
    key = _task_key(task_id) + ":todo_list"
    items = await redis_client.lrange(key, 0, -1)
    out: List[Dict[str, Any]] = []
    for it in items or []:
        try:
            out.append(json.loads(it))
        except Exception:
            continue
    return out


async def add_todo(task_id: str, text: str, priority: int = 0) -> None:
    key = _task_key(task_id) + ":todo_list"
    await redis_client.rpush(key, json.dumps({"text": text, "priority": priority, "done": False}))


async def mark_todo_done(task_id: str, index: int) -> None:
    key = _task_key(task_id) + ":todo_list"
    items = await redis_client.lrange(key, 0, -1)
    if index < 0 or index >= len(items):
        return
    try:
        obj = json.loads(items[index])
    except Exception:
        return
    obj["done"] = True
    await redis_client.lset(key, index, json.dumps(obj))


async def append_scratchpad(task_id: str, content: str) -> None:
    key = _task_key(task_id) + ":scratchpad"
    existing = await redis_client.get(key)
    new_value = (existing + "\n" + content) if existing else content
    await redis_client.set(key, new_value)