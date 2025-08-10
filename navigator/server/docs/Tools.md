# Tools

All tools live in `src/services/tools/`. They auto-register with `ToolsRegistry` on import.

## Categories

- Core Browsing: click, type, select_option, hover, scroll, upload_file
- Navigation: navigate_url, go_back, go_forward, refresh_page, open_new_tab, switch_to_tab, close_current_tab
- Extraction: extract_text, extract_table_as_json, take_screenshot
- Agent Control: answer_user, ask_user_for_clarification, task_complete, task_failed, update_scratchpad, add_todo, mark_todo_done
- Generation: generate_doc, generate_ppt, generate_sheet

## Design

- Each tool defines:
  - `tool_id`, `name`, `description`
  - `parameters: ToolParameter[]` with `name`, `type`, `description`, `required`, `default`
- Parameters are kept consistent and unambiguous so the planner can select reliably.

These tools are auto-registered via decorators in `src/services/tools/tools_registry.py`. The planner is given a readable schema of available tools each turn.

## Validation

`BaseTool.validate_parameters` checks required parameters exist, but additional runtime validation is performed in executors or on the client side. For browser actions, the server emits a `browser_command` which the extension executes.



