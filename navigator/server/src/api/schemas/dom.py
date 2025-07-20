from dataclasses import Field
from typing import Dict, List, Any
from pydantic import BaseModel
from typing import Union


class DOMTextNode(BaseModel):
    element_id: str
    text: str

class DOMMetadata(BaseModel):
    cursor: str
    interactive_ancestor_id: str | None = None

class DOMTagNode(BaseModel):
    element_id: int
    navigator_id: str | None = None
    tag: str
    attributes: Dict[str, Any]
    children_ids: List[int] = []
    xpath: str
    child_frame_id: int | None = None
    is_interactive: bool = False
    is_visible_and_on_top: bool = False
    metadata: DOMMetadata | None = None
    text_content: str | None = None
    is_likely_captcha: bool = False

class FrameData(BaseModel):
    frame_id: int
    parent_frame_id: int
    url: str
    html: str
    metadata: Dict[str, DOMMetadata]

class FullDOMData(BaseModel):
    url: str
    title: str
    timestamp: str
    frames: List[FrameData]

DOMElementNode = Union[DOMTagNode, DOMTextNode]