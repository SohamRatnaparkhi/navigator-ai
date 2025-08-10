import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.services.llm_service import plan_next_action, update_scratchpad_via_llm, update_todos_via_llm
from src.api.schemas.dom import FullDOMData, DOMTagNode
from src.api.schemas.tasks import PlannedAction, ExecutionResult
from src.services.redis_service import (
    get_task_goal,
    get_action_history,
    append_action_history,
    append_execution_log,
    set_scratchpad,
    get_scratchpad,
    get_todo_list,
    append_scratchpad,
    add_todo,
)
from src.services.tools.tools_registry import ToolsRegistry
# Ensure tool modules are imported so the registry is populated
from src.services import tools as _tools_autoreg  # noqa: F401
from src.utils.dom.parser import parse_and_optimize_dom
from src.utils.prompts.planner_prompt import get_planner_prompt


logger = logging.getLogger(__name__)


class Executor:
    """Executes planned actions using server-side tools or by emitting browser commands."""

    BROWSER_ACTIONS = {
        "click",
        "type",
        "select_option",
        "hover",
        "scroll",
        "upload_file",
        "navigate_url",
        "go_back",
        "go_forward",
        "refresh_page",
        "open_new_tab",
        "switch_to_tab",
        "close_current_tab",
        "take_screenshot",
    }

    SERVER_ACTIONS = {
        "extract_text",
        "extract_table_as_json",
        "generate_doc",
        "generate_ppt",
        "generate_sheet",
        "answer_user",
        "ask_user_for_clarification",
        "task_complete",
        "task_failed",
    }

    def __init__(self, parsed_dom_frames: Dict[int, Dict[int, DOMTagNode]]):
        self.parsed_dom_frames = parsed_dom_frames

    def execute(self, action: PlannedAction) -> ExecutionResult:
        action_name = action.action.lower()
        params = action.parameters or {}

        if action_name in self.BROWSER_ACTIONS:
            browser_command = {"tool": action_name, "parameters": params}
            return ExecutionResult(
                status="success",
                message=f"Browser command emitted: {action_name}",
                data={"browser_command": browser_command},
            )

        if action_name == "extract_text":
            element_id = self._require_param(params, "element_id", int)
            frame_id = params.get("frame_id", 0)
            text = self._extract_text_from_dom(frame_id, element_id)
            if text is None:
                return ExecutionResult(status="error", message=f"Element {element_id} not found in frame {frame_id}")
            return ExecutionResult(status="success", message="Text extracted", data={"text": text})

        if action_name == "extract_table_as_json":
            # Placeholder: requires table parsing; return not implemented but structured
            return ExecutionResult(status="error", message="extract_table_as_json not implemented yet")

        if action_name in {"generate_doc", "generate_ppt", "generate_sheet"}:
            # Generation handled server-side; left as placeholder
            return ExecutionResult(status="error", message=f"{action_name} not implemented yet")

        if action_name in {"answer_user", "ask_user_for_clarification", "task_complete", "task_failed"}:
            # Control actions are handled as status messages/memory
            return ExecutionResult(status="success", message=f"Control action: {action_name}", data={"control": action_name, **params})

        return ExecutionResult(status="error", message=f"Unknown action: {action_name}")

    @staticmethod
    def _require_param(params: Dict[str, Any], key: str, expected_type: Any) -> Any:
        if key not in params:
            raise ValueError(f"Missing required parameter '{key}'")
        value = params[key]
        if expected_type is not Any and not isinstance(value, expected_type):
            # Allow ints that come as str
            if expected_type is int and isinstance(value, str) and value.isdigit():
                return int(value)
            raise ValueError(f"Parameter '{key}' must be of type {expected_type}")
        return value

    def _extract_text_from_dom(self, frame_id: int, element_id: int) -> Optional[str]:
        frame_dom = self.parsed_dom_frames.get(frame_id)
        if not frame_dom:
            return None

        if element_id not in frame_dom:
            return None

        visited: set[int] = set()

        def dfs_collect(node_id: int) -> List[str]:
            if node_id in visited:
                return []
            visited.add(node_id)
            node = frame_dom.get(node_id)
            if not node:
                return []
            pieces: List[str] = []
            if node.text_content:
                pieces.append(node.text_content)
            for child_id in node.children_ids:
                pieces.extend(dfs_collect(child_id))
            return pieces

        parts = dfs_collect(element_id)
        text = " ".join(p.strip() for p in parts if p and p.strip())
        return text if text else ""


def _format_tools_for_prompt() -> str:
    tools = ToolsRegistry.get_all_tools()
    lines = [
        "Available tools (tool_id - name):",
    ]
    for tool in tools:
        param_strs = [
            f"- {p.name}: type={p.type}, required={p.required}" + (f", default={p.default}" if p.default is not None else "")
            for p in tool.parameters
        ]
        param_lines = [f"    {s}" for s in param_strs] if param_strs else ["    (none)"]
        block_lines = [
            f"{tool.tool_id} - {tool.name}",
            f"  Description: {tool.description}",
            "  Parameters:",
            *param_lines,
        ]
        lines.append("\n".join(block_lines))
    return "\n\n".join(lines)


async def _plan_next_action(
    task_id: str,
    optimized_dom_string: str,
    user_goal: str,
    action_history: List[Dict[str, Any]],
) -> PlannedAction:

    scratchpad = await get_scratchpad(task_id)
    todo_list = await get_todo_list(task_id)

    tools_text = _format_tools_for_prompt()
    prompt = get_planner_prompt(
        tools_schema=tools_text,
        optimized_dom=optimized_dom_string[:25000],
        user_query=user_goal or "",
        action_history=action_history[-15:],
    ) + f"\n\nScratchpad:\n{scratchpad or ''}\n\nTodo List:\n{json.dumps(todo_list, ensure_ascii=False)}\n\nReturn ONLY JSON."

    return await plan_next_action(prompt)


async def run_agent_loop(task_id: str, dom_data: FullDOMData, max_steps: int = 25) -> Dict[str, Any]:
    """
    Runs the Perceive-Plan-Execute-Memorize loop. Returns the last execution result and any browser command to dispatch.
    """
    # Perceive
    optimized_dom_string, url_map, element_map = parse_and_optimize_dom(dom_data)

    # Plan
    user_goal = await get_task_goal(task_id)
    action_history = await get_action_history(task_id)
    try:
        planned_action = await _plan_next_action(
            task_id=task_id,
            optimized_dom_string=optimized_dom_string,
            user_goal=user_goal or "",
            action_history=action_history or [],
        )
    except Exception as e:
        logger.exception("Planner failed")
        return ExecutionResult(status="error", message=f"Planner error: {e}").model_dump()

    # Execute
    executor = Executor(parsed_dom_frames={})
    try:
        exec_result = executor.execute(planned_action)
    except Exception as e:
        logger.exception("Executor failed")
        exec_result = ExecutionResult(status="error", message=f"Execution error: {e}")

    try:
        context_str = (
            f"Goal: {user_goal}\n"
            f"Recent actions: {json.dumps(action_history[-10:], ensure_ascii=False)}\n"
            f"Last result: {json.dumps(exec_result.model_dump(), ensure_ascii=False)}\n"
            f"Page: {optimized_dom_string[:3000]}"
        )
        current_sp = await get_scratchpad(task_id)
        current_todos = await get_todo_list(task_id)
        sp_task = asyncio.create_task(update_scratchpad_via_llm(context_str, current_sp))
        td_task = asyncio.create_task(update_todos_via_llm(context_str, current_todos))
        sp_update, td_update = await asyncio.gather(sp_task, td_task)

        if sp_update and sp_update.text:
            if sp_update.mode == "replace":
                await set_scratchpad(task_id, sp_update.text)
            else:
                await append_scratchpad(task_id, sp_update.text)

        if td_update:
            for item in (td_update.add or []):
                await add_todo(task_id, item.text, item.priority)
            for idx in (td_update.mark_done_indices or []):
                try:
                    from src.services.redis_service import mark_todo_done
                    await mark_todo_done(task_id, int(idx))
                except Exception:
                    pass
    except Exception:
        logger.exception("Memory LLM updates failed")

    # Memorize
    await append_action_history(task_id, planned_action.model_dump())
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": planned_action.model_dump(),
        "result": exec_result.model_dump(),
        "url_map": url_map,
    }
    await append_execution_log(task_id, log_entry)

    # Special memory handling (keep for deterministic capture of extracted text)
    if planned_action.action.lower() == "extract_text" and exec_result.status == "success":
        text = (exec_result.data or {}).get("text", "")
        if text:
            await append_scratchpad(task_id, text)

    out = {
        "planned_action": planned_action.model_dump(),
        "execution_result": exec_result.model_dump(),
    }
    cmd = (exec_result.data or {}).get("browser_command") if exec_result.data else None
    if isinstance(cmd, dict):
        params = cmd.get("parameters", {})
        element_id = params.get("element_id")
        if isinstance(element_id, int) and element_id in element_map:
            out["execution_result"]["data"]["element"] = {
                "element_id": element_id,
                **{k: v for k, v in element_map[element_id].items() if k in {"xpath", "tag", "attributes"}},
            }
    return out


