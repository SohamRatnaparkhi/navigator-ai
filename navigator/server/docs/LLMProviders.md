# LLM Providers & Models

We support Gemini, OpenAI, and Groq with structured outputs where possible.

## Config

Env vars:
- `LLM_PROVIDER` – `gemini` | `openai` | `groq`
- `PLANNER_MODEL` – main agent model
- `COARSE_PLAN_MODEL` – cheaper model for the initial plan preview
- `GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`

## Structured outputs

- Gemini (google-genai): set `generation_config={"response_mime_type": "application/json"}` when calling `models.generate_content`.
- OpenAI: use `response_format={ "type": "json_schema" | "json_object" }` on `chat.completions.create`.
- Groq: use `response_format={ "type": "json_object" }` on `chat.completions.create`.

Helper builders in `src/services/model_configs/` centralize safe defaults:
- `build_gemini_generate_config(json_mime=True)`
- `build_openai_chat_args(...)`
- `build_groq_chat_args(...)`

## Routing

`src/services/llm_service.py` handles routing per provider, so callers just pass prompts.

`list_available_providers_and_models()` returns suggested strong models (see `src/services/llm_service.py`):

```json
{
  "gemini": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
  "openai": ["gpt-5", "gpt-5-mini", "o4-mini"],
  "groq": ["moonshotai/kimi-k2-instruct", "openai/gpt-oss-120b"]
}
```



