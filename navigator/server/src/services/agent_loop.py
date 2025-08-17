import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from src.api.schemas.dom import DOMTagNode, FullDOMData
from src.api.schemas.tasks import ExecutionResult, PlannedAction, PlannedActionSequence

from src.services import tools as _tools_autoreg  # noqa: F401
from src.services.llm_service import (
    plan_next_actions,
    update_scratchpad_via_llm,
    update_todos_via_llm,
)
from src.services.redis_service import (
    add_todo,
    append_action_history,
    append_execution_log,
    append_scratchpad,
    get_action_history,
    get_scratchpad,
    get_task_goal,
    get_todo_list,
    mark_todo_done,
    set_scratchpad,
)
from src.services.tools.tools_registry import ToolsRegistry
from src.utils.dom.parser import parse_and_optimize_dom
from src.utils.prompts.planner_prompt import get_planner_prompt

logger = logging.getLogger(__name__)


def _should_write_logs() -> bool:
    flag = os.getenv("WRITE_LOGS") or os.getenv("write_logs")
    if flag is None:
        return False
    return str(flag).strip().lower() in {"1", "true", "yes", "y", "on"}


def _get_logs_run_dir(task_id: str, step_index: int) -> Path:
    # Place logs under server/logs/<task_id>/step_XXX
    server_dir = Path(__file__).resolve().parents[2]
    logs_root = server_dir / "logs" / task_id
    step_dir = logs_root / f"step_{step_index:03d}"
    step_dir.mkdir(parents=True, exist_ok=True)
    return step_dir


def _safe_write_text(path: Path, content: str) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    except Exception:
        logger.exception("Failed writing text log: %s", path)


def _safe_write_json(path: Path, data: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        logger.exception("Failed writing json log: %s", path)


def create_word_batches(text: str, words_per_batch: int = 4000, padding_words: int = 250) -> List[str]:
    """
    Split text into word-based batches with padding for context.
    
    Args:
        text: Input text to split
        words_per_batch: Target words per batch
        padding_words: Number of words to add as padding at start/end of each batch
    
    Returns:
        List of batched text strings
    """
    words = text.split()
    total_words = len(words)
    
    if total_words <= words_per_batch:
        return [text]
    
    batches = []
    start_idx = 0
    
    while start_idx < total_words:
        core_end = min(start_idx + words_per_batch, total_words)
        
        actual_start = max(0, start_idx - padding_words)
        
        actual_end = min(total_words, core_end + padding_words)
        
        batch_words = words[actual_start:actual_end]
        batch_text = " ".join(batch_words)
        
        batches.append(batch_text)
        
        start_idx = core_end
    
    return batches


def replace_url_in_command(browser_command: Dict[str, Any], url_map: Dict[str, str]) -> Dict[str, Any]:
    """
    Replace URL mappings in browser commands for navigation actions.
    
    Args:
        browser_command: The browser command dict
        url_map: Mapping of url_id to actual URLs
    
    Returns:
        Updated browser command with actual URLs
    """
    if not isinstance(browser_command, dict):
        return browser_command
    
    tool = browser_command.get("tool", "").lower()
    parameters = browser_command.get("parameters", {})
    
    if tool == "navigate_url":
        url = parameters.get("url", "")
        if isinstance(url, str):
            # Check if this is a mapped URL (pattern: url_X)
            url_pattern = re.search(r'url_(\d+)', url)
            if url_pattern:
                url_id = url_pattern.group(0)  # e.g., "url_1"
                if url_id in url_map:
                    # Replace with actual URL
                    actual_url = url_map[url_id]
                    parameters["url"] = url.replace(url_id, actual_url)
                    
                    return {
                        **browser_command,
                        "parameters": parameters
                    }
    
    elif tool == "click":
        pass
    
    return browser_command


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

async def _plan_next_action_for_batch(
    batch_text: str,
    tools_text: str,
    user_goal: str,
    action_history: List[Dict[str, Any]],
    scratchpad: str,
    todo_list: List[Dict[str, Any]],
    batch_index: int
) -> PlannedActionSequence:
    """Plan action for a single batch of DOM content."""
    prompt = get_planner_prompt(
        tools_schema=tools_text,
        optimized_dom=batch_text,
        user_query=user_goal or "",
        action_history=action_history[-15:],
    ) + f"\n\nScratchpad:\n{scratchpad or ''}\n\nTodo List:\n{json.dumps(todo_list, ensure_ascii=False)}\n\nBatch {batch_index + 1}: Return ONLY JSON."

    return await plan_next_actions(prompt)

def format_iteration_results(prev_iteration_result: Optional[Dict[str, Any]]) -> str:
    try:
        if prev_iteration_result is None:
            return ""
        statements = []
        for result in prev_iteration_result.get("results"):
            action = result.get("action")
            message = result.get("message")
            if action:
                statements.append(f"The previous iteration was successful. The user's goal was achieved. The action was: {action} and the result was - {message}.")
            else:
                statements.append(f"The previous iteration was unsuccessful. The user's goal was not achieved. The error message was: {message}.")
            if statements:
                return f"Here are the results of the previous iteration:\n{'\n'.join(statements)}"
            return ""
    except Exception:
        logger.exception("Failed to format iteration results")
        return ""


async def _plan_next_action(
    task_id: str,
    optimized_dom_string: str,
    user_goal: str,
    action_history: List[Dict[str, Any]],
    prev_iteration_result: Optional[Dict[str, Any]] = None,
) -> Tuple[PlannedActionSequence, int]:

    scratchpad = await get_scratchpad(task_id)
    todo_list = await get_todo_list(task_id)
    tools_text = _format_tools_for_prompt()

    formatted_iteration_results = format_iteration_results(prev_iteration_result)

    batches = create_word_batches(optimized_dom_string, words_per_batch=2000, padding_words=250)
    
    logger.info(f"Created {len(batches)} batches for planning. Total DOM words: {len(optimized_dom_string.split())}")
    
    if len(batches) == 1:
        prompt = get_planner_prompt(
            tools_schema=tools_text,
            optimized_dom=batches[0],
            user_query=user_goal or "",
            action_history=action_history[-15:],
        ) + f"\n\n{formatted_iteration_results} \n\nScratchpad:\n{scratchpad or ''}\n\nTodo List:\n{json.dumps(todo_list, ensure_ascii=False)}\n\nReturn ONLY JSON."
        
        return await plan_next_actions(prompt), 0
    
    tasks = [
        _plan_next_action_for_batch(
            batch_text=batch,
            tools_text=tools_text,
            user_goal=user_goal,
            action_history=action_history,
            scratchpad=scratchpad or "",
            todo_list=todo_list or [],
            batch_index=i
        )
        for i, batch in enumerate(batches)
    ]
    
    try:
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(batch_results):
            if isinstance(result, PlannedActionSequence):
                logger.info(f"Using planned action from batch {i + 1}")
                return result, i
            elif isinstance(result, Exception):
                logger.warning(f"Batch {i + 1} failed: {result}")
        
        logger.warning("All batches failed, falling back to single batch approach")
        prompt = get_planner_prompt(
            tools_schema=tools_text,
            optimized_dom=batches[0],
            user_query=user_goal or "",
            action_history=action_history[-15:],
        ) + f"\n\n{formatted_iteration_results} \n\n Scratchpad:\n{scratchpad or ''}\n\nTodo List:\n{json.dumps(todo_list, ensure_ascii=False)}\n\nReturn ONLY JSON."
        
        return await plan_next_actions(prompt), 0
        
    except Exception:
        logger.exception("Error in parallel batch planning")
        prompt = get_planner_prompt(
            tools_schema=tools_text,
            optimized_dom="\n".join(batches),
            user_query=user_goal or "",
            action_history=action_history[-15:],
        ) + f"\n\nScratchpad:\n{scratchpad or ''}\n\nTodo List:\n{json.dumps(todo_list, ensure_ascii=False)}\n\nReturn ONLY JSON."
        
        return await plan_next_actions(prompt), 0


async def run_agent_loop(task_id: str, dom_data: FullDOMData, iteration_result: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Runs the Perceive-Plan-Execute-Memorize loop. Returns the last execution result and any browser command to dispatch.
    """
    # Perceive
    optimized_dom_string, url_map, element_map, parsed_frames = parse_and_optimize_dom(dom_data)
    # Plan
    user_goal = await get_task_goal(task_id)
    action_history = await get_action_history(task_id)

    # Optional step-based file logging
    logs_run_dir: Optional[Path] = None
    if _should_write_logs():
        try:
            logs_run_dir = _get_logs_run_dir(task_id, len(action_history or []))
            _safe_write_text(logs_run_dir / "optimized_dom.txt", optimized_dom_string)
            _safe_write_json(logs_run_dir / "url_map.json", url_map)
            _safe_write_json(logs_run_dir / "element_map.json", element_map)

            serializable_frames: Dict[str, Dict[str, Any]] = {}
            for frame_id, nodes in (parsed_frames or {}).items():
                frame_key = str(frame_id)
                serializable_frames[frame_key] = {}
                for node_id, node in (nodes or {}).items():
                    serializable_frames[frame_key][str(node_id)] = (
                        node.model_dump() if hasattr(node, "model_dump") else getattr(node, "dict", lambda: {} )()
                    )
            _safe_write_json(logs_run_dir / "parsed_frames.json", serializable_frames)
        except Exception:
            logger.exception("Failed writing perception logs")

    try:
        planned_seq, selected_batch_index = await _plan_next_action(
            task_id=task_id,
            optimized_dom_string=optimized_dom_string,
            user_goal=user_goal or "",
            action_history=action_history or [],
            prev_iteration_result=iteration_result,
        )
    except Exception as e:
        logger.exception("Planner failed")
        return ExecutionResult(status="error", message=f"Planner error: {e}").model_dump()
    else:
        if logs_run_dir is not None:
            try:
                # Write both the full sequence and the first action for debugging
                _safe_write_json(logs_run_dir / "planned_actions.json", planned_seq.model_dump())
                if (planned_seq.actions or []):
                    _safe_write_json(logs_run_dir / "planned_action.json", planned_seq.actions[0].model_dump())
            except Exception:
                logger.exception("Failed writing planned action log")

    # Execute
    executor = Executor(parsed_dom_frames=parsed_frames)
    primary_action: Optional[PlannedAction] = (planned_seq.actions or [None])[0] if planned_seq else None
    try:
        if not isinstance(primary_action, PlannedAction):
            raise RuntimeError("Planner produced no actionable items")
        exec_result = executor.execute(primary_action)
    except Exception as e:
        logger.exception("Executor failed")
        exec_result = ExecutionResult(status="error", message=f"Execution error: {e}")
    finally:
        if logs_run_dir is not None:
            try:
                _safe_write_json(logs_run_dir / "execution_result.json", exec_result.model_dump())
            except Exception:
                logger.exception("Failed writing execution result log")

    # Persist planner reasoning to scratchpad (concise)
    try:
        # Prefer sequence-level reasoning, fallback to first action reasoning
        seq_reasoning = getattr(planned_seq, "reasoning", None)
        act_reasoning = getattr((planned_seq.actions or [None])[0], "reasoning", None)
        concise_reason = str(seq_reasoning or act_reasoning or "").strip()
        if concise_reason:
            await append_scratchpad(task_id, f"Planner reasoning: {concise_reason}")
    except Exception:
        logger.exception("Failed appending planner reasoning to scratchpad")

    try:
        dom_batches = create_word_batches(optimized_dom_string, words_per_batch=2000, padding_words=250)
        context_str = (
            f"Goal: {user_goal}\n"
            f"Recent actions: {json.dumps(action_history[-10:], ensure_ascii=False)}\n"
            f"Last result: {json.dumps(exec_result.model_dump(), ensure_ascii=False)}\n"
            f"Page: {dom_batches[selected_batch_index] if dom_batches else ''}"
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
                    await mark_todo_done(task_id, int(idx))
                except Exception:
                    pass
    except Exception:
        logger.exception("Memory LLM updates failed")

    # Memorize
    # Record the whole planned sequence for traceability
    try:
        await append_action_history(task_id, planned_seq.model_dump())
    except Exception:
        # Fallback to logging first action only
        try:
            if planned_seq.actions:
                await append_action_history(task_id, planned_seq.actions[0].model_dump())
        except Exception:
            pass
    log_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "action": (planned_seq.actions[0].model_dump() if planned_seq.actions else {}),
        "result": exec_result.model_dump(),
    }
    await append_execution_log(task_id, log_entry)

    # Special memory handling (keep for deterministic capture of extracted text)
    if primary_action and primary_action.action.lower() == "extract_text" and exec_result.status == "success":
        text = (exec_result.data or {}).get("text", "")
        if text:
            await append_scratchpad(task_id, text)

    out = {
        # Backward-compatible single action (first item)
        "planned_action": (planned_seq.actions[0].model_dump() if planned_seq.actions else {}),
        # New multi-action field
        "planned_actions": [a.model_dump() for a in (planned_seq.actions or [])],
        "execution_result": exec_result.model_dump(),
    }
    # Attach element details for each planned action that references an element_id
    try:
        planned_elements: List[Dict[str, Any]] = []
        for idx, act in enumerate(planned_seq.actions or []):
            params = getattr(act, "parameters", {}) or {}
            el_id = params.get("element_id")
            if isinstance(el_id, int) and el_id in element_map:
                details = element_map.get(el_id) or {}
                planned_elements.append({
                    "index": idx,
                    "element_id": el_id,
                    "tag": details.get("tag"),
                    "xpath": details.get("xpath"),
                    "attributes": details.get("attributes", {}),
                })
        if planned_elements:
            out["planned_actions_elements"] = planned_elements
    except Exception:
        logger.exception("Failed attaching planned action element details")
    # Include token usage and provider/model info for memory updates
    try:
        if 'sp_update' in locals() and sp_update:
            out.setdefault("memory_updates", {})["scratchpad"] = {
                "provider": getattr(sp_update, "provider", None),
                "model": getattr(sp_update, "model", None),
                "token_usage": getattr(sp_update, "token_usage", None),
            }
        if 'td_update' in locals() and td_update:
            out.setdefault("memory_updates", {})["todos"] = {
                "provider": getattr(td_update, "provider", None),
                "model": getattr(td_update, "model", None),
                "token_usage": getattr(td_update, "token_usage", None),
            }
    except Exception:
        logger.exception("Failed to attach memory update metadata to output")
    cmd = (exec_result.data or {}).get("browser_command") if exec_result.data else None
    if isinstance(cmd, dict):
        cmd = replace_url_in_command(cmd, url_map)
        out["execution_result"]["data"]["browser_command"] = cmd
        
        params = cmd.get("parameters", {})
        element_id = params.get("element_id")
        if isinstance(element_id, int) and element_id in element_map:
            out["execution_result"]["data"]["element"] = {
                "element_id": element_id,
                **{k: v for k, v in element_map[element_id].items() if k in {"xpath", "tag", "attributes"}},
            }
    
    # Final output log
    if logs_run_dir is not None:
        try:
            _safe_write_json(logs_run_dir / "final_out.json", out)
        except Exception:
            logger.exception("Failed writing final out log")
    return out


