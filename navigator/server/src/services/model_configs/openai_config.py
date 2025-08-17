from typing import Any, Dict, Optional


def build_openai_chat_args(
    model: str,
    *,
    reasoning_effort: Optional[str] = None,
    verbosity: Optional[str] = None,
    response_format: Optional[Dict[str, Any]] = None,
    messages: Optional[list[dict]] = None,
) -> Dict[str, Any]:
    """Build args for OpenAI Chat/Responses depending on model family.

    Notes for GPT-5 family:
    - temperature is NOT supported; do not include it.
    - reasoning.effort is supported via `reasoning_effort` or Responses `reasoning` block.
    - verbosity is supported via `verbosity` or Responses `text` block.

    We currently normalize to Chat Completions for non-GPT-5 models, and to
    Chat Completions with the new top-level keys supported for GPT-5 according
    to our client usage elsewhere in the codebase.
    """

    args: Dict[str, Any] = {
        "model": model,
    }

    # Attach messages only if provided; some flows build them separately
    if messages is not None:
        args["messages"] = messages

    # GPT-5 family supports reasoning effort and verbosity (no temperature)
    is_gpt5 = model.startswith("gpt-5")
    if is_gpt5:
        if reasoning_effort:
            # For Chat Completions compatibility (SDK maps to Responses under the hood)
            args["reasoning_effort"] = reasoning_effort
        if verbosity:
            args["verbosity"] = verbosity
    else:
        args["temperature"] = 0.2

    if response_format is not None:
        args["response_format"] = response_format

    return args


