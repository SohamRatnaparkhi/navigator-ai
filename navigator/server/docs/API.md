# HTTP API

Base path: `/api/v1`

## Health
GET `/api/v1/health` → `{ status: 'ok' }`

## Create Task
POST `/api/v1/tasks/create`

Body:
```json
{
  "task": "string",
  "url": "string",
  "openTabsWithIds": ["..."],
  "currentTab": "..."
}
```

Response:
```json
{
  "task_id": "uuid",
  "chain_of_thought": {
    "title": "string",
    "steps": [{"title": "string", "description": "string"}]
  }
}
```

Notes:
- Uses a cheaper model to produce a brief plan preview.

## Update Task (agent loop turn)
POST `/api/v1/tasks/update`

Body:
```json
{
  "task_id": "uuid",
  "dom_data": { "url": "...", "title": "...", "timestamp": "...", "frames": [...] },
  "iterationNumber": 0,
  "openTabsWithIds": [],
  "currentTab": null,
  "scratchpad": "optional string to set",
  "add_todo": "optional string to add",
  "mark_todo_done_index": 0
}
```

Response:
```json
{
  "status": "updated",
  "task_id": "uuid",
  "planned_action": { "action": "string", "parameters": { } },
  "execution_result": { "status": "success|error", "message": "", "data": { "browser_command": {"tool": "", "parameters": {}} } },
  "todo_list": [{"text": "", "priority": 0, "done": false}],
  "scratchpad": "..."
}
```

## Ask About Page
POST `/api/v1/tasks/ask`

Body:
```json
{
  "task_id": "uuid",
  "dom_data": { "url": "...", "title": "...", "timestamp": "...", "frames": [...] },
  "question": "string"
}
```

Response:
```json
{ "status": "ok", "answer": "string" }
```

Notes:
- Uses the same DOM pipeline but a distinct, answer-focused prompt with JSON-only outputs.



