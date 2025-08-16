import uuid
import json
import logging
from fastapi import APIRouter, Body
from typing import Dict, Any
from src.api.schemas.dom import FullDOMData
from src.utils.dom.parser import parse_and_optimize_dom, parse_full_dom  # noqa: F401
from src.services.redis_service import redis_client
from src.services.llm_service import generate_chain_of_thought
from src.api.schemas.tasks import CreateTaskRequest, CreateTaskResponse
from src.services.agent_loop import run_agent_loop
from src.services.redis_service import add_todo, get_todo_list, mark_todo_done, get_scratchpad, set_scratchpad
from src.services.llm_service import update_scratchpad_via_llm, update_todos_via_llm  # noqa: F401

router = APIRouter(prefix="/tasks")
logger = logging.getLogger(__name__)

@router.post("/create")
async def create_task(request: CreateTaskRequest = Body(...)) -> CreateTaskResponse:
    task_id = str(uuid.uuid4())
    logger.info(f"Task {task_id} created and stored in Redis")
    cot = generate_chain_of_thought(request.task, request.url, request.openTabsWithIds, request.currentTab)
    key = f"task:{task_id}"
    # Store a richer state so planner can read the goal later
    value = {
        "task": request.task,
        "url": request.url,
        "openTabsWithIds": request.openTabsWithIds,
        "currentTab": request.currentTab,
        "chain_of_thought": cot.model_dump() if cot else None,
        "created_at": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    }

    await redis_client.set(key, __import__("json").dumps(value))
    return CreateTaskResponse(task_id=task_id, chain_of_thought=cot)

@router.post("/update")
async def update_task(update_data: Dict[str, Any] = Body(...)):
    task_id = update_data.get("task_id")
    dom_data_raw = update_data.get("dom_data")

    if not task_id or not dom_data_raw:
        return {"status": "error", "error": "Missing task_id or dom_data"}

    dom_data = FullDOMData(**dom_data_raw)

    if not await redis_client.exists(f"task:{task_id}"):
        logger.warning(f"Task {task_id} not found")
        return {"status": "not found", "task_id": task_id}

    # Optional context management operations from the extension
    if (sp := update_data.get("scratchpad")) is not None:
        await set_scratchpad(task_id, sp)
    if (new_todo := update_data.get("add_todo")):
        await add_todo(task_id, str(new_todo))
    if (done_index := update_data.get("mark_todo_done_index")) is not None:
        try:
            await mark_todo_done(task_id, int(done_index))
        except Exception:
            pass

    # Run a single loop turn
    loop_result = await run_agent_loop(task_id=task_id, dom_data=dom_data)

    logger.info(f"Task {task_id} loop turn completed")
    todos = await get_todo_list(task_id)
    scratchpad_text = await get_scratchpad(task_id)
    return {"status": "updated", "task_id": task_id, **loop_result, "todo_list": todos, "scratchpad": scratchpad_text}


@router.post("/ask")
async def ask_about_page(payload: Dict[str, Any] = Body(...)):
    """
    Answer a user question using the current page context.
    Expects: { task_id: str, dom_data: FullDOMData, question: str }
    Returns: { status, answer, sources?, browser_command? }
    """
    task_id = payload.get("task_id")
    dom_raw = payload.get("dom_data")
    question = payload.get("question", "")

    if not task_id or not dom_raw or not question:
        return {"status": "error", "error": "Missing task_id, dom_data or question"}

    dom_data = FullDOMData(**dom_raw)

    # Reuse our parsing pipeline to generate optimized DOM for QA context
    optimized_dom_string, url_map, element_map, parsed_frames = parse_and_optimize_dom(dom_data)

    # Build a QA prompt (answer-focused, concise, cite element ids where helpful)
    from src.services.tools.tools_registry import ToolsRegistry
    from src.services import tools as _tools_autoreg  # noqa: F401
    available_tools = ", ".join(t.tool_id for t in ToolsRegistry.get_all_tools())

    prompt = (
        "You are an assistant answering a question about the current webpage. "
        "Use only information visible in the optimized DOM below. If unsure, say so briefly. "
        "When referring to elements, cite element_id and frame_id if relevant. Be concise.\n\n"
        f"User question: {question}\n\n"
        f"Optimized DOM:\n{optimized_dom_string[:24000]}\n\n"
        f"Available tools (for potential follow-up actions): {available_tools}\n"
        "Return ONLY JSON: {\"answer\": string}."
    )

    # Call provider with JSON-only response
    from src.services.llm_service import LLM_PROVIDER, PLANNER_MODEL, get_gemini_client, get_openai_client, get_groq_client
    provider = (LLM_PROVIDER or "gemini").lower()
    model = PLANNER_MODEL

    try:
        if provider == "gemini":
            client = get_gemini_client()
            resp = client.models.generate_content(
                model=model,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
            text = resp.text() if hasattr(resp, "text") else str(resp)
        elif provider == "openai":
            client = get_openai_client()
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": "JSON only."}, {"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            text = resp.choices[0].message.content or "{}"
        else:
            client = get_groq_client()
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": "JSON only."}, {"role": "user", "content": prompt}],
                temperature=0.2,
                response_format={"type": "json_object"},
            )
            text = resp.choices[0].message.content or "{}"
    except Exception as e:
        logger.exception("/ask provider call failed")
        return {"status": "error", "error": f"LLM call failed: {e}"}

    try:
        obj_start = text.find("{")
        obj_end = text.rfind("}")
        data = json.loads(text[obj_start: obj_end + 1]) if obj_start != -1 and obj_end != -1 else json.loads(text)
        answer = str(data.get("answer", "")).strip()
    except Exception:
        logger.exception("/ask parse error")
        answer = ""

    return {"status": "ok", "answer": answer}