# Navigator AI – Server Docs

Welcome to the server-side documentation for Navigator AI. This covers the backend APIs, the agentic loop, LLM providers, memory, tools, and how the browser extension integrates.

If you are new, start here, then see the other docs in this folder for deeper dives.

## What is Navigator AI?

Navigator AI is an LLM-powered browser automation agent. It can understand a user’s goal, perceive the current page, plan one step at a time, execute actions via the extension, and memorize context to stay on track.

The project consists of:
- A FastAPI server (this repo section)
- A browser extension (Vite + React/TS) for collecting DOM data and executing browser commands

## Core Concepts

- Perceive → Plan → Execute → Memorize
  - Perceive: Parse and optimize DOM for LLM consumption
  - Plan: Use an LLM to choose the next action (single structured action)
  - Execute: Either return a browser command for the extension or run server-side tools
  - Memorize: Append history, logs, and update scratchpad/todo in Redis

- Scratchpad and Todo List
  - Task-scoped memory to keep the agent on track
  - Continuously updated and sent to the planner

- Structured Outputs
  - We enforce JSON-only responses and schemas where supported for reliable parsing

## Quick Start

1) Configure environment (see `LLMProviders.md`).

2) Run server (from `navigator/server`):

```bash
poetry install
poetry run fastapi dev src/main.py
```

3) Load the extension and connect it to the server (see extension README in the repo).

## Key Files

- API Routers: `src/api/routers/tasks.py`
- Agent Loop: `src/services/agent_loop.py`
- LLM Calls: `src/services/llm_service.py` and `src/utils/llm_clients.py`
- Model Configs: `src/services/model_configs/`
- DOM Pipeline: `src/utils/dom/parser.py`, `src/utils/dom/optimizer.py`
- Tools: `src/services/tools/`
- Schemas: `src/api/schemas/*`
- Redis Service: `src/services/redis_service.py`

## Next Steps

- Read `Architecture.md` for a mental model.
- Read `API.md` for request/response contracts.
- Read `AgentLoop.md` for Perceive/Plan/Execute/Memorize details.
- Read `LLMProviders.md` to configure providers/models and env vars.
- Read `ContextMemory.md` for scratchpad and todo behaviors.



