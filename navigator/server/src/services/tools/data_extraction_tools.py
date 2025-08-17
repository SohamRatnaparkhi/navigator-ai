from src.api.schemas.tasks import Tool, ToolParameter
from .base_tool import BaseTool
from .tools_registry import register_tool


class ExtractTextTool(BaseTool):
    """Tool for extracting text content from elements"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="extract_text",
            name="Extract Text Content",
            description="Extract text from an element (and its subtree) using the server's parsed DOM. Returns plain text with no HTML. Provide the element_id and frame_id from the optimized DOM.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="The unique identifier of the element to extract text from"
                ),
                ToolParameter(
                    name="frame_id",
                    type="int",
                    description="The frame identifier where the element is located (0 for main frame)"
                )
            ]
        )

class ExtractTableAsJsonTool(BaseTool):
    """Tool for extracting table data as structured JSON"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="extract_table_as_json",
            name="Extract Table as JSON",
            description="Parse an HTML <table> element into structured JSON (headers + rows). Provide element_id/frame_id from the optimized DOM.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="The unique identifier of the table element to parse"
                ),
                ToolParameter(
                    name="frame_id",
                    type="int",
                    description="The frame identifier where the table is located (0 for main frame)"
                )
            ]
        )
    

class TakeScreenshotTool(BaseTool):
    """Tool for capturing screenshots"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="take_screenshot",
            name="Take Screenshot",
            description="Capture a screenshot of the viewport or a specific element. Returns base64 image data. Use element_id only to capture a specific element; otherwise omit.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="Optional: ID of specific element to screenshot (if not provided, captures full viewport)",
                    required=False
                ),
                ToolParameter(
                    name="frame_id",
                    type="int", 
                    description="The frame identifier where screenshot should be taken (0 for main frame)",
                    required=False,
                    default=0
                )
            ]
        )
    

# Register all tools
@register_tool(ExtractTextTool().get_tool_definition())
class RegisteredExtractTextTool(ExtractTextTool):
    pass

@register_tool(ExtractTableAsJsonTool().get_tool_definition())
class RegisteredExtractTableAsJsonTool(ExtractTableAsJsonTool):
    pass

@register_tool(TakeScreenshotTool().get_tool_definition())
class RegisteredTakeScreenshotTool(TakeScreenshotTool):
    pass 