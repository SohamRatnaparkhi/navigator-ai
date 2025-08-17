from src.api.schemas.tasks import Tool, ToolParameter
from .base_tool import BaseTool
from .tools_registry import register_tool


class ClickTool(BaseTool):
    """Tool for clicking interactive elements on web pages"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="click",
            name="Click Element",
            description="Perform a precise click on a single interactive element. Use for buttons, links, checkboxes, radios, and any clickable control. Preconditions: the target must be visible and interactive in the current DOM snapshot. Always supply the exact element_id and frame_id from the optimized DOM. If multiple candidates exist, prefer the one with matching text/attributes; otherwise use 'ask_user_for_clarification'.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="The unique identifier of the element to click, obtained from DOM analysis"
                ),
                ToolParameter(
                    name="frame_id", 
                    type="int",
                    description="The frame identifier where the element is located (0 for main frame)"
                )
            ]
        )
    

class TypeTool(BaseTool):
    """Tool for typing text into input fields"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="type",
            name="Type Text",
            description="Type text into an input, textarea, or contenteditable element. Default behavior: clear existing value before typing. Set 'is_sensitive' to true for passwords/PII (avoid echoing values). Always specify element_id and frame_id from the optimized DOM.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int", 
                    description="The unique identifier of the input element to type into"
                ),
                ToolParameter(
                    name="frame_id",
                    type="int",
                    description="The frame identifier where the element is located (0 for main frame)"
                ),
                ToolParameter(
                    name="text",
                    type="str",
                    description="The text content to type into the field"
                ),
                ToolParameter(
                    name="is_sensitive",
                    type="bool",
                    description="Set to true for passwords or PII to prevent logging",
                    required=False,
                    default=False
                )
            ]
        )
    

class SelectOptionTool(BaseTool):
    """Tool for selecting options from dropdown menus"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="select_option",
            name="Select Dropdown Option",
            description="Choose an option in a native <select> by value. Prefer this over clicking option nodes. Requires stable 'option_value' and the select element's element_id/frame_id from the optimized DOM.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="The unique identifier of the select element"
                ),
                ToolParameter(
                    name="frame_id",
                    type="int", 
                    description="The frame identifier where the element is located (0 for main frame)"
                ),
                ToolParameter(
                    name="option_value",
                    type="str",
                    description="The value attribute of the option to select"
                )
            ]
        )
    

class HoverTool(BaseTool):
    """Tool for hovering over elements to reveal hidden content"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="hover",
            name="Hover Over Element", 
            description="Hover over an element to reveal hover-dependent UI (menus, tooltips, popovers). Use when content appears on hover. Provide element_id and frame_id from the optimized DOM.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="The unique identifier of the element to hover over"
                ),
                ToolParameter(
                    name="frame_id",
                    type="int",
                    description="The frame identifier where the element is located (0 for main frame)"
                )
            ]
        )
    

class ScrollTool(BaseTool):
    """Tool for scrolling the page or specific elements"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="scroll",
            name="Scroll Page or Element",
            description="Scroll the main window or a specific scrollable container. Use to reveal off-screen content or load lazy content. Direction must be one of 'up' | 'down' | 'left' | 'right'. Provide element_id only for scrolling a specific container; omit to scroll the main window.",
            parameters=[
                ToolParameter(
                    name="direction",
                    type="str", 
                    description="Direction to scroll: 'up', 'down', 'left', or 'right'"
                ),
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="Optional: ID of specific element to scroll (if not provided, scrolls main window)",
                    required=False
                ),
                ToolParameter(
                    name="frame_id",
                    type="int",
                    description="The frame identifier where scrolling should occur (0 for main frame)",
                    required=False,
                    default=0
                )
            ]
        )
    

class UploadFileTool(BaseTool):
    """Tool for uploading files through file input elements"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="upload_file",
            name="Upload File",
            description="Upload a local file via an <input type='file'> control. Provide an absolute path if possible. Ensure the file picker is associated with the specified element_id/frame_id.",
            parameters=[
                ToolParameter(
                    name="element_id",
                    type="int",
                    description="The unique identifier of the file input element"
                ),
                ToolParameter(
                    name="frame_id",
                    type="int",
                    description="The frame identifier where the element is located (0 for main frame)"
                ),
                ToolParameter(
                    name="file_path",
                    type="str",
                    description="Absolute or relative path to the file to upload"
                )
            ]
        )
    

# Register all tools
@register_tool(ClickTool().get_tool_definition())
class RegisteredClickTool(ClickTool):
    pass

@register_tool(TypeTool().get_tool_definition())
class RegisteredTypeTool(TypeTool):
    pass

@register_tool(SelectOptionTool().get_tool_definition())
class RegisteredSelectOptionTool(SelectOptionTool):
    pass

@register_tool(HoverTool().get_tool_definition())
class RegisteredHoverTool(HoverTool):
    pass

@register_tool(ScrollTool().get_tool_definition())
class RegisteredScrollTool(ScrollTool):
    pass

@register_tool(UploadFileTool().get_tool_definition())
class RegisteredUploadFileTool(UploadFileTool):
    pass 