import base64
import json
import os
import re
from typing import List, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from dotenv import load_dotenv

load_dotenv()

client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)

class Action(BaseModel):
    type: str
    element_id: Optional[str] = None
    xpath_ref: Optional[str] = None
    selector: Optional[str] = None
    text: Optional[str] = None
    amount: Optional[int] = None
    url: Optional[str] = None

class CurrentState(BaseModel):
    page_summary: str
    evaluation_previous_goal: str
    next_goal: str

class GenerateResponse(BaseModel):
    current_state: CurrentState
    actions: List[Action]
    is_done: bool

def parse_json_from_text(text):
    """Extract and parse JSON from text, handling potential formatting issues."""
    # Clean the text
    text = text.strip()
    
    # Handle markdown code blocks
    if text.startswith("```json"):
        # Remove opening markdown
        text = text[7:].strip()
    elif text.startswith("```"):
        # Remove opening markdown
        text = text[3:].strip()
        
    # Remove closing markdown
    if text.endswith("```"):
        text = text[:-3].strip()
    
    # Try to parse the clean text
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # If that fails, try to extract JSON using regex
        json_pattern = r'\{[\s\S]*\}'
        match = re.search(json_pattern, text)
        
        if match:
            json_candidate = match.group(0)
            try:
                return json.loads(json_candidate)
            except json.JSONDecodeError:
                pass
    
    # Return default structure if all parsing attempts fail
    return {
        "current_state": {
            "page_summary": "Failed to parse LLM output.",
            "evaluation_previous_goal": "Unknown",
            "next_goal": "Try different approach"
        },
        "actions": [],
        "is_done": False
    }


def generate(user_prompt, system_prompt) -> GenerateResponse:

    model = "gemini-2.0-pro-exp-02-05"
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text=user_prompt
                ),
            ],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        temperature=0.3,
        top_p=0.95,
        top_k=64,
        max_output_tokens=8192,
        response_mime_type="application/json",
        response_schema=genai.types.Schema(
            type=genai.types.Type.OBJECT,
            enum=[],
            required=["current_state", "actions", "is_done"],
            properties={
                "current_state": genai.types.Schema(
                    type=genai.types.Type.OBJECT,
                    enum=[],
                    required=["page_summary",
                              "evaluation_previous_goal", "next_goal"],
                    properties={
                        "page_summary": genai.types.Schema(
                            type=genai.types.Type.STRING,
                        ),
                        "evaluation_previous_goal": genai.types.Schema(
                            type=genai.types.Type.STRING,
                        ),
                        "next_goal": genai.types.Schema(
                            type=genai.types.Type.STRING,
                        ),
                    },
                ),
                "actions": genai.types.Schema(
                    type=genai.types.Type.ARRAY,
                    items=genai.types.Schema(
                        type=genai.types.Type.OBJECT,
                        enum=[],
                        required=["type"],
                        properties={
                            "type": genai.types.Schema(
                                type=genai.types.Type.STRING,
                            ),
                            "element_id": genai.types.Schema(
                                type=genai.types.Type.STRING,
                            ),
                            "xpath_ref": genai.types.Schema(
                                type=genai.types.Type.STRING,
                            ),
                            "selector": genai.types.Schema(
                                type=genai.types.Type.STRING,
                            ),
                            "text": genai.types.Schema(
                                type=genai.types.Type.STRING,
                            ),
                            "amount": genai.types.Schema(
                                type=genai.types.Type.INTEGER,
                            ),
                            "url": genai.types.Schema(
                                type=genai.types.Type.STRING,
                            ),
                        },
                    ),
                ),
                "is_done": genai.types.Schema(
                    type=genai.types.Type.BOOLEAN,
                ),
            },
        ),
        system_instruction=[
            types.Part.from_text(
                text=system_prompt
            ),
        ],
    )
    
    # Make the API call
    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=generate_content_config,
    )
    print(response.text)
    print(response.usage_metadata)
    
    # Process response to ensure it's valid JSON
    try:
        # Try to parse the response text as JSON to validate it
        json_response = json.loads(response.text)
        return GenerateResponse.model_validate(json_response)
    except json.JSONDecodeError:
        # If parsing fails, try to extract JSON
        print("Warning: LLM returned invalid JSON. Attempting to fix...")
        fixed_json = parse_json_from_text(response.text)
        return GenerateResponse.model_validate(fixed_json)
    except Exception as e:
        print(f"Error processing response: {e}")
        # Return a fallback JSON response
        fallback = {
            "current_state": {
                "page_summary": "Error processing LLM response.",
                "evaluation_previous_goal": "Unknown",
                "next_goal": "Please try again"
            },
            "actions": [],
            "is_done": False
        }
        return GenerateResponse.model_validate(fallback)

# generate()
