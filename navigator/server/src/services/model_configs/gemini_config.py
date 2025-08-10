from typing import Optional
from google.genai import types as genai_types


def build_gemini_generate_config(
    *,
    json_mime: bool = False,
    safety_settings: Optional[list] = None,
) -> genai_types.GenerateContentConfig:
    """Build a Gemini GenerateContentConfig with optional JSON mime.
    """
    return genai_types.GenerateContentConfig(
        response_mime_type="application/json" if json_mime else None,
        safety_settings=safety_settings,
        temperature=0.2
    )


