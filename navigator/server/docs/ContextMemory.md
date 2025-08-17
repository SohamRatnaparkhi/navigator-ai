# Context & Memory (Redis)

We store task context in Redis to keep the agent grounded and up-to-date across turns.

## Keys

- `task:{task_id}` – JSON metadata: { task, url, openTabsWithIds, currentTab, chain_of_thought, created_at }
- `task:{task_id}:action_history` – list of planned action JSON objects
- `task:{task_id}:execution_log` – list of entries { timestamp, action, result, url_map }
- `task:{task_id}:scratchpad` – free-form notes (string)
- `task:{task_id}:todo_list` – list of { text, priority, done }

## API Helpers

Defined in `src/services/redis_service.py`:
- Read goal: `get_task_goal`
- History: `get_action_history`, `append_action_history`
- Logs: `append_execution_log`
- Scratchpad: `get_scratchpad`, `set_scratchpad`, `append_scratchpad`
- Todos: `get_todo_list`, `add_todo`, `mark_todo_done`

From the `/api/v1/tasks/update` endpoint, you can also directly manage context per turn by passing optional fields:
- `scratchpad` (string) to set the scratchpad
- `add_todo` (string) to append a todo item (priority defaults to 0)
- `mark_todo_done_index` (number) to mark a todo complete by index

## Planner Context

The planner receives:
- User goal
- Recent action history (up to 15)
- Scratchpad text
- Todo list JSON
- Optimized DOM
- Available tools

This improves consistency and reduces drift.

## Scratchpad & Todo LLM Updaters

We also have separate, cheaper LLM calls for managing scratchpad and todos:
- `update_scratchpad_via_llm(context, current_scratchpad)` → `{ mode, text }`
- `update_todos_via_llm(context, current_todos)` → `{ add: [{text, priority}], mark_done_indices: number[] }`

These keep planning focused (single-action) and reduce quality drop from over-structured prompts. They are executed each turn with recent context.



