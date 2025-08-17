from abc import ABC, abstractmethod
from typing import Any, Dict
from src.api.schemas.tasks import Tool


class BaseTool(ABC):
    """Base class for all browser automation tools"""
    
    def __init__(self):
        self.tool_definition = self.get_tool_definition()
    
    @abstractmethod
    def get_tool_definition(self) -> Tool:
        """Return the tool definition with metadata"""
        pass
    
    def validate_parameters(self, params: Dict[str, Any]) -> bool:
        """Validate that required parameters are provided"""
        required_params = [p.name for p in self.tool_definition.parameters if p.required]
        return all(param in params for param in required_params) 