# Agent Loop

Location: `src/services/agent_loop.py`

## Steps

1) Perceive
- Input: `FullDOMData`
- Calls `parse_and_optimize_dom`
- Produces `optimized_by_frame`, `url_map`, and `parsed_frames`

2) Plan
- Builds prompt with:
  - User goal (from Redis)
  - Recent action history
  - Scratchpad (free-form notes)
  - Todo list
  - Optimized DOM
  - Available tools (from `ToolsRegistry`)
- Calls `plan_next_action` (structured outputs enforced)

3) Execute
- Browser actions → return `browser_command`
- Server actions → execute on server (e.g., `extract_text`)
- Returns `ExecutionResult`

3.5) Context Management
- After execution, lightweight LLM helpers may update scratchpad and todos based on recent context via `update_scratchpad_via_llm` and `update_todos_via_llm`.

4) Memorize
- Appends to action history and execution log in Redis
- On `extract_text`, updates scratchpad

## JSON Contracts

`PlannedAction`:
```json
{ "action": "string", "parameters": { } }
```

`ExecutionResult`:
```json
{ "status": "success|error", "message": "...", "data": { } }
```

## Error Handling
- Planner and executor are wrapped; failures become `ExecutionResult` with `status=error`.
- LLM JSON parsing is resilient; logs raw text when parsing fails.



