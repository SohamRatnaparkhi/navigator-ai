from typing import List, Dict, Optional, Any
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
    provider: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[Dict[str, Any]] = None
    extra_data: Optional[Dict[str, Any]] = {}  # For additional unknown fields 

class ToolParameter(BaseModel):
    name: str
    type: str
    description: str
    required: bool = True
    default: Optional[Any] = None

class Tool(BaseModel):
    tool_id: str
    name: str
    description: str
    parameters: List[ToolParameter]
    
    class Config:
        arbitrary_types_allowed = True


class PlannedAction(BaseModel):
    action: str
    parameters: Dict[str, Any] | None = None
    reasoning: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[Dict[str, Any]] = None


class PlannedActionSequence(BaseModel):
    actions: List[PlannedAction]
    reasoning: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[Dict[str, Any]] = None


class ExecutionResult(BaseModel):
    status: str  # "success" | "error"
    message: str
    data: Optional[Dict[str, Any]] = None


class ScratchpadUpdate(BaseModel):
    mode: str  # 'append' | 'replace'
    text: str
    provider: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[Dict[str, Any]] = None


class TodoAdd(BaseModel):
    text: str
    priority: int = 0


class TodoChanges(BaseModel):
    add: List[TodoAdd] = []
    mark_done_indices: List[int] = []
    provider: Optional[str] = None
    model: Optional[str] = None
    token_usage: Optional[Dict[str, Any]] = None