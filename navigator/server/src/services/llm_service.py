import json
import logging
import time
from typing import List, Optional
from src.api.schemas.tasks import ChainOfThought, CoTStep, PlannedAction, ScratchpadUpdate, TodoChanges, TodoAdd
from src.config import LLM_PROVIDER, PLANNER_MODEL, COARSE_PLAN_MODEL
from src.utils.llm_clients import get_gemini_client, get_openai_client, get_groq_client
from src.utils.prompts.coarse_plan_prompt import get_coarse_plan_prompt
from src.utils.prompts.memory_prompts import get_scratchpad_update_prompt, get_todo_update_prompt
from google.genai import types as genai_types
from src.services.model_configs import (
    build_openai_chat_args,
    build_gemini_generate_config,
    build_groq_chat_args,
)

def generate_chain_of_thought(query: str, url: str, openTabsWithIds: List[str], currentTab: str) -> Optional[ChainOfThought]:
    """Cheap, brief plan preview for the first request.

    Uses a cheaper model (COARSE_PLAN_MODEL if provided) and requests a short structured JSON:
    { title: string, steps: [{title, description}] up to 4 steps }.
    """
    provider = (LLM_PROVIDER or "gemini").lower()
    model_name = COARSE_PLAN_MODEL or PLANNER_MODEL

    schema = {
        "name": "chain_of_thought_preview",
        "schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "steps": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "description": {"type": "string"}
                        },
                        "required": ["title", "description"],
                        "additionalProperties": False
                    },
                    "maxItems": 4
                }
            },
            "required": ["title", "steps"],
            "additionalProperties": False
        },
        "strict": False,
    }

    content = get_coarse_plan_prompt(query, url, openTabsWithIds, currentTab)

    try:
        if provider == "gemini":
            client = get_gemini_client()
            if client is None:
                raise RuntimeError("Gemini client not configured")
            contents = [
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text=content)],
                )
            ]
            cfg = build_gemini_generate_config(json_mime=True)
            resp = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=cfg,
            )
            text = getattr(resp, "text", None) or str(resp)
        elif provider == "openai":
            client = get_openai_client()
            if client is None:
                raise RuntimeError("OpenAI client not configured")
            messages = [
                {"role": "system", "content": "Return ONLY JSON."},
                {"role": "user", "content": content},
            ]
            args = build_openai_chat_args(
                model=model_name,
                reasoning_effort="low" if model_name.startswith("gpt-5") else None,
                verbosity="low" if model_name.startswith("gpt-5") else None,
                response_format={"type": "json_schema", "json_schema": schema},
                messages=messages,
            )
            r = client.chat.completions.create(**args)
            text = r.choices[0].message.content or "{}"
        else:  # groq
            client = get_groq_client()
            if client is None:
                raise RuntimeError("Groq client not configured")
            messages = [
                {"role": "system", "content": "Return ONLY JSON."},
                {"role": "user", "content": content},
            ]
            args = build_groq_chat_args(
                model=model_name,
                temperature=0.2,
                response_format={"type": "json_object"},
                messages=messages,
            )
            r = client.chat.completions.create(**args)
            text = r.choices[0].message.content or "{}"
    except Exception:
        logger.exception("Coarse plan (chain of thought) call failed")
        # Fallback minimal response
        return ChainOfThought(title="Plan", steps=[CoTStep(title="Start", description="Begin at the provided URL.")])

    try:
        obj_start = text.find("{")
        obj_end = text.rfind("}")
        json_str = text[obj_start: obj_end + 1] if obj_start != -1 and obj_end != -1 else text
        data = json.loads(json_str)
        steps = [CoTStep(title=str(s.get("title", "")).strip(), description=str(s.get("description", "")).strip()) for s in data.get("steps", [])][:4]
        return ChainOfThought(title=str(data.get("title", "Plan")), steps=steps or [CoTStep(title="Start", description="Open the starting page and analyze UI.")])
    except Exception:
        logger.exception("Failed to parse coarse plan JSON")
        return ChainOfThought(title="Plan", steps=[CoTStep(title="Start", description="Open the starting page and analyze UI.")])


logger = logging.getLogger(__name__)


async def plan_next_action(prompt: str) -> PlannedAction:
    """Calls the Planner LLM with the assembled prompt and returns a PlannedAction.

    The LLM must return strictly JSON. We will try to extract the first JSON object in the response.
    """
    provider = (LLM_PROVIDER or "gemini").lower()
    model_name = PLANNER_MODEL

    # JSON schema for strong structured outputs where supported
    planned_action_schema = {
        "name": "planned_action",
        "schema": {
            "type": "object",
            "properties": {
                "action": {"type": "string"},
                "parameters": {"type": "object"},
            },
            "required": ["action", "parameters"],
            "additionalProperties": True,
        },
        "strict": False,
    }

    try:
        if provider == "gemini":
            client = get_gemini_client()

            if client is None:
                raise RuntimeError("Gemini client not configured")
            contents = [
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text=prompt)],
                )
            ]
            cfg = build_gemini_generate_config(json_mime=True)
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=cfg,
            )
            text = getattr(response, "text", None) or str(response)

        elif provider == "openai":
            client = get_openai_client()
            if client is None:
                raise RuntimeError("OpenAI client not configured")
            messages = [
                {"role": "system", "content": "You must respond with ONLY valid JSON."},
                {"role": "user", "content": prompt},
            ]
            args = build_openai_chat_args(
                model=model_name,
                reasoning_effort="medium" if model_name.startswith("gpt-5") else None,
                verbosity="low" if model_name.startswith("gpt-5") else None,
                response_format={
                    "type": "json_schema",
                    "json_schema": planned_action_schema,
                },
                messages=messages,
            )
            resp = client.chat.completions.create(**args)
            text = resp.choices[0].message.content or "{}"

        elif provider == "groq":
            client = get_groq_client()
            if client is None:
                raise RuntimeError("Groq client not configured")
            messages = [
                {"role": "system", "content": "You must respond with ONLY valid JSON."},
                {"role": "user", "content": prompt},
            ]
            args = build_groq_chat_args(
                model=model_name,
                temperature=0.2,
                response_format={"type": "json_object"},
                messages=messages,
            )
            resp = client.chat.completions.create(**args)
            text = resp.choices[0].message.content or "{}"

        else:
            raise RuntimeError(f"Unsupported LLM provider: {provider}")
    except Exception as e:
        logger.exception("Planner provider call failed for plan_next_action")
        raise RuntimeError(f"Planner LLM call failed: {e}")

    # Try to parse JSON from text
    try:
        obj_start = text.find("{")
        obj_end = text.rfind("}")
        json_str = text[obj_start : obj_end + 1] if obj_start != -1 and obj_end != -1 else text
        data = json.loads(json_str)
        if not isinstance(data, dict) or "action" not in data:
            raise ValueError("Planner did not return an action object")
    except Exception as e:
        logger.error(f"Failed to parse planner output as JSON: {text}")
        raise RuntimeError(f"Invalid planner output: {e}")

    return PlannedAction(action=str(data.get("action", "")).strip(), parameters=data.get("parameters") or {})


async def update_scratchpad_via_llm(context: str, current_scratchpad: str) -> ScratchpadUpdate:
    """Ask a small LLM to update the scratchpad only, returning structured mode+text."""
    provider = (LLM_PROVIDER or "gemini").lower()
    model_name = COARSE_PLAN_MODEL
    prompt = get_scratchpad_update_prompt(context, current_scratchpad)
    try:
        if provider == "gemini":
            client = get_gemini_client()
            contents = [
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text=prompt)],
                )
            ]
            cfg = build_gemini_generate_config(json_mime=True)
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=cfg,
            )
            text = getattr(response, "text", None) or str(response)
        elif provider == "openai":
            client = get_openai_client()
            messages = [
                {"role": "system", "content": "JSON only."},
                {"role": "user", "content": prompt},
            ]
            args = build_openai_chat_args(
                model=model_name,
                reasoning_effort="low" if model_name.startswith("gpt-5") else None,
                verbosity="medium" if model_name.startswith("gpt-5") else None,
                response_format={"type": "json_object"},
                messages=messages,
            )
            resp = client.chat.completions.create(**args)
            text = resp.choices[0].message.content or "{}"
        else:  # groq
            client = get_groq_client()
            messages = [
                {"role": "system", "content": "JSON only."},
                {"role": "user", "content": prompt},
            ]
            args = build_groq_chat_args(
                model=model_name,
                temperature=0.2,
                response_format={"type": "json_object"},
                messages=messages,
            )
            resp = client.chat.completions.create(**args)
            text = resp.choices[0].message.content or "{}"
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        mode = str(data.get("mode", "append")).lower()
        if mode not in {"append", "replace"}:
            mode = "append"
        return ScratchpadUpdate(mode=mode, text=str(data.get("text", "")).strip())
    except Exception:
        logger.exception("Scratchpad LLM update failed")
        return ScratchpadUpdate(mode="append", text="")


async def update_todos_via_llm(context: str, current_todos: list[dict]) -> TodoChanges:
    """Ask a small LLM to update the todo list only (adds and marks-done)."""
    provider = (LLM_PROVIDER or "gemini").lower()
    model_name = COARSE_PLAN_MODEL
    prompt = get_todo_update_prompt(context, current_todos)
    try:
        if provider == "gemini":
            client = get_gemini_client()
            contents = [
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part.from_text(text=prompt)],
                )
            ]
            response = client.models.generate_content(model=model_name, contents=contents)
            text = getattr(response, "text", None) or str(response)
        elif provider == "openai":
            client = get_openai_client()
            messages = [
                {"role": "system", "content": "JSON only."},
                {"role": "user", "content": prompt},
            ]
            args = build_openai_chat_args(
                model=model_name,
                reasoning_effort="low" if model_name.startswith("gpt-5") else None,
                verbosity="medium" if model_name.startswith("gpt-5") else None,
                messages=messages,
            )
            resp = client.chat.completions.create(**args)
            text = resp.choices[0].message.content or "{}"
        else:
            client = get_groq_client()
            messages = [
                {"role": "system", "content": "JSON only."},
                {"role": "user", "content": prompt},
            ]
            args = build_groq_chat_args(
                model=model_name,
                temperature=0.2,
                messages=messages,
            )
            resp = client.chat.completions.create(**args)
            text = resp.choices[0].message.content or "{}"
        data = json.loads(text[text.find("{"): text.rfind("}") + 1])
        add = [TodoAdd(**item) for item in data.get("add", [])] if isinstance(data.get("add", []), list) else []
        mark_done = [int(i) for i in data.get("mark_done_indices", [])]
        return TodoChanges(add=add, mark_done_indices=mark_done)
    except Exception:
        logger.exception("Todo LLM update failed")
        return TodoChanges(add=[], mark_done_indices=[])


def list_available_providers_and_models() -> dict:
    """Return available providers and suggested strong models."""
    return {
        "gemini": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
        "openai": ["gpt-5", "gpt-5-mini", "o4-mini"],
        "groq": ["moonshotai/kimi-k2-instruct", "openai/gpt-oss-120b"],
    }