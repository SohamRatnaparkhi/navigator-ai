# Architecture

## Overview

Navigator AI server provides:
- HTTP API to create tasks, update DOM, answer questions, and run the agent loop
- DOM parsing/optimization for token-efficient LLM context
- Tooling registry for actions the agent can take
- LLM abstraction over Gemini, OpenAI, and Groq
- Redis-backed memory for task context, action history, logs, scratchpad, and todo list

## Perceive → Plan → Execute → Memorize

1) Perceive
- Input: `FullDOMData` from the extension
- Function: `parse_and_optimize_dom` in `src/utils/dom/parser.py`
- Output:
  - `optimized_dom_string: str` – token-optimized, concatenated view of the DOM
  - `url_map: Dict[str, str]` – long URLs truncated and mapped
  - `element_map: Dict[int, {xpath, tag, attributes}]` – minimal metadata for referenced elements

2) Plan
- Inputs: `optimized_dom_string`, user goal, recent action history, scratchpad, todo list
- Function: `_plan_next_action` in `src/services/agent_loop.py` (delegates to `plan_next_action` in `src/services/llm_service.py`)
- LLM: JSON-only response with exactly one action `{ action, parameters }`

3) Execute
- Executor routes actions:
  - Browser actions: return `{ browser_command }` for the extension to perform (includes navigation, interactions, scrolling, and `take_screenshot`)
  - Server actions: run on server (e.g., `extract_text`, generation, or agent-control signals)
- Returns `ExecutionResult`

4) Memorize
- Append to `action_history` and `execution_log`
- Run lightweight LLM helpers to update `scratchpad` and `todo_list` based on recent context
- Special case: when `extract_text` succeeds, append extracted text to scratchpad for determinism

## Tools Registry

All tool definitions are under `src/services/tools/`. They auto-register on import via decorators in `tools_registry.py`. The loop lists available tools to the planner.

Categories:
- Core Browsing: click, type, select_option, hover, scroll, upload_file
- Navigation: navigate_url, go_back, go_forward, refresh_page, open_new_tab, switch_to_tab, close_current_tab
- Extraction: extract_text, extract_table_as_json, take_screenshot
- Agent Control & Context: answer_user, ask_user_for_clarification, task_complete, task_failed, update_scratchpad, add_todo, mark_todo_done
- Generation: generate_doc, generate_ppt, generate_sheet

## Memory (Redis)

Key shapes:
- `task:{task_id}` – JSON with goal, tabs, CoT, timestamps
- `task:{task_id}:action_history` – list of action JSON
- `task:{task_id}:execution_log` – list of entries `{timestamp, action, result, url_map}`
- `task:{task_id}:scratchpad` – free-form text
- `task:{task_id}:todo_list` – list of `{ text, priority, done }`

APIs in `src/services/redis_service.py` manage these keys.

## LLM Providers

We support structured outputs across:
- Gemini (Google GenAI): set `response_mime_type=application/json`
- OpenAI: use `response_format={ type: 'json_schema' | 'json_object' }`
- Groq: `response_format={ type: 'json_object' }`

Environment variables:
- `LLM_PROVIDER` (gemini | openai | groq)
- `PLANNER_MODEL` – main agent planner
- `COARSE_PLAN_MODEL` – cheaper model for initial plan preview
- `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`



