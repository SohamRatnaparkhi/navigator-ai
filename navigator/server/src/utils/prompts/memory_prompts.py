from typing import List, Dict, Any


def get_scratchpad_update_prompt(context: str, current_scratchpad: str) -> str:
    return (
        "You maintain a task scratchpad for a browser automation agent. "
        "Given the context (goal, recent actions, and current page summary) and the current scratchpad, "
        "propose a minimal update that helps the agent stay on track. Follow this decision policy "
        "(consistent with the planner): Prefer direct interaction with visible elements over search/scroll. "
        "If a Button/Link/Input matching the next step is visible, favor clicking/typing/selecting on it. "
        "Only suggest search or scrolling if the visible DOM lacks any relevant control. For forms, prefer batching "
        "typing across fields before submitting. Keep the note concise and concrete.\n\n"
        f"Context:\n{context}\n\n"
        f"Current scratchpad:\n{current_scratchpad}\n\n"
        "Return ONLY JSON with shape {\"mode\": 'append'|'replace', \"text\": string}."
    )


def get_todo_update_prompt(context: str, current_todos: List[Dict[str, Any]]) -> str:
    return (
        "You maintain a short todo list for a browser automation agent. Keep items small and actionable. "
        "Given the context (goal, recent actions, and current page summary) and current todos, propose changes. "
        "Follow this strict policy (aligned with the planner):\n"
        "- Prefer visible direct actions (click/type/select) on matching elements over search.\n"
        "- Do NOT add a 'search' or 'scroll' todo if a relevant element is visible. Use scroll only as a last resort.\n"
        "- For forms, you may add multiple small typing todos followed by a submit click to reduce round trips.\n"
        "- Avoid vague items; make todos concrete and minimal (2-5 items total).\n\n"
        f"Context:\n{context}\n\n"
        f"Current todos (JSON):\n{current_todos}\n\n"
        "Return ONLY JSON with shape {\"add\":[{\"text\":string,\"priority\":number}], \"mark_done_indices\":[number]}."
    )


