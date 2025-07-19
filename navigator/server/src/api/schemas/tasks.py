from typing import List, Dict, Optional
from pydantic import BaseModel

class CoTStep(BaseModel):
    title: str
    description: str

class ChainOfThought(BaseModel):
    title: str
    steps: List[CoTStep]

class CreateTaskRequest(BaseModel):
    task: str
    url: str
    openTabsWithIds: List[str]
    currentTab: str

class CreateTaskResponse(BaseModel):
    task_id: str
    chain_of_thought: Optional[ChainOfThought]
    extra_data: Optional[Dict[str, str]] = {}  # For additional unknown fields 