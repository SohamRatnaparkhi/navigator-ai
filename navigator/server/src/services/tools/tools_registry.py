from typing import Dict, Optional

from src.api.schemas.tasks import Tool

class ToolsRegistry:
    _instance: Optional['ToolsRegistry'] = None
    _tools: Dict[str, Tool] = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def register_tool(cls, tool: Tool):
        def decorator(tool_class):
            cls._tools[tool.tool_id] = tool
            return tool_class
        return decorator

    @classmethod
    def get_tool(cls, tool_id: str) -> Optional[Tool]:
        return cls._tools.get(tool_id)
    
    @classmethod
    def get_all_tools(cls) -> list[Tool]:
        return list(cls._tools.values())
    
    @classmethod
    def get_tool_count(cls) -> int:
        return len(cls._tools)
    
register_tool = ToolsRegistry.register_tool