from typing import List, Dict, Any


def get_scratchpad_update_prompt(context: str, current_scratchpad: str) -> str:
    return (
        "You maintain a task scratchpad for a browser automation agent. "
        "Given the context (goal, recent actions, and current page summary) and the current scratchpad, "
        "propose a minimal update that helps the agent stay on track.\n\n"
        f"Context:\n{context}\n\n"
        f"Current scratchpad:\n{current_scratchpad}\n\n"
        "Return ONLY JSON with shape {\"mode\": 'append'|'replace', \"text\": string}."
    )


def get_todo_update_prompt(context: str, current_todos: List[Dict[str, Any]]) -> str:
    return (
        "You maintain a short todo list for a browser automation agent. Keep items small and actionable. "
        "Given the context (goal, recent actions, and current page summary) and current todos, propose changes.\n\n"
        f"Context:\n{context}\n\n"
        f"Current todos (JSON):\n{current_todos}\n\n"
        "Return ONLY JSON with shape {\"add\":[{\"text\":string,\"priority\":number}], \"mark_done_indices\":[number]}."
    )


