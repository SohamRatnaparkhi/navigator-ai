from typing import Any, Dict, Optional


def build_groq_chat_args(
    model: str,
    *,
    temperature: Optional[float] = None,
    response_format: Optional[Dict[str, Any]] = None,
    messages: Optional[list[dict]] = None,
) -> Dict[str, Any]:
    """Build args for Groq chat.completions.create.

    Keep temperature optional; some Groq models benefit from low temperature
    for structured JSON outputs.
    """
    args: Dict[str, Any] = {
        "model": model,
    }
    if messages is not None:
        args["messages"] = messages
    if temperature is not None:
        args["temperature"] = temperature
    if response_format is not None:
        args["response_format"] = response_format
    return args


