from app.api.utils.dom_parser.processor import parse_dom
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class DOMParseRequest(BaseModel):
    html: str


@router.post("/parse")
async def dom_parse(request: DOMParseRequest):
    """Parse the DOM state and return the updated DOM state"""
    parsed_dom_state = parse_dom(request.html)
    return parsed_dom_state
