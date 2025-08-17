from src.api.schemas.tasks import Tool, ToolParameter
from .base_tool import BaseTool
from .tools_registry import register_tool


class NavigateUrlTool(BaseTool):
    """Tool for navigating to a new URL"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="navigate_url",
            name="Navigate to URL",
            description="Navigate the current tab to a new URL. Provide a full absolute URL. Use this to start a workflow or follow a direct link when an element is not available.",
            parameters=[
                ToolParameter(
                    name="url",
                    type="str",
                    description="The complete URL to navigate to (e.g., 'https://example.com', 'http://localhost:3000')"
                )
            ]
        )
    

class GoBackTool(BaseTool):
    """Tool for navigating back in browser history"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="go_back",
            name="Go Back",
            description="Go to the previous page in history for the active tab. No-op if there is no previous entry.",
            parameters=[]
        )
    

class GoForwardTool(BaseTool):
    """Tool for navigating forward in browser history"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="go_forward",
            name="Go Forward",
            description="Go forward in history for the active tab. No-op if at the end of the history stack.",
            parameters=[]
        )
    

class RefreshPageTool(BaseTool):
    """Tool for refreshing the current page"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="refresh_page",
            name="Refresh Page",
            description="Reload the current tab from the network. Useful to retry after transient errors or to refresh dynamic content.",
            parameters=[]
        )
    

class OpenNewTabTool(BaseTool):
    """Tool for opening a new browser tab"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="open_new_tab",
            name="Open New Tab",
            description="Open a new tab, optionally with a URL. Use 'make_active' to control focus. Useful for multi-tab workflows or background loading.",
            parameters=[
                ToolParameter(
                    name="url",
                    type="str", 
                    description="Optional URL to navigate to in the new tab",
                    required=False
                ),
                ToolParameter(
                    name="make_active",
                    type="bool",
                    description="Whether to switch focus to the new tab immediately",
                    required=False,
                    default=True
                )
            ]
        )
    

class SwitchToTabTool(BaseTool):
    """Tool for switching between browser tabs"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="switch_to_tab",
            name="Switch to Tab",
            description="Switch focus to a specific tab by its id. Essential for multi-tab workflows.",
            parameters=[
                ToolParameter(
                    name="tab_id",
                    type="str",
                    description="The unique identifier of the tab to switch to"
                )
            ]
        )
    

class CloseCurrentTabTool(BaseTool):
    """Tool for closing the current browser tab"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="close_current_tab",
            name="Close Current Tab",
            description="Close the currently active tab. Be careful: unsaved work may be lost.",
            parameters=[]
        )
    

# Register all tools
@register_tool(NavigateUrlTool().get_tool_definition())
class RegisteredNavigateUrlTool(NavigateUrlTool):
    pass

@register_tool(GoBackTool().get_tool_definition())
class RegisteredGoBackTool(GoBackTool):
    pass

@register_tool(GoForwardTool().get_tool_definition())
class RegisteredGoForwardTool(GoForwardTool):
    pass

@register_tool(RefreshPageTool().get_tool_definition())
class RegisteredRefreshPageTool(RefreshPageTool):
    pass

@register_tool(OpenNewTabTool().get_tool_definition())
class RegisteredOpenNewTabTool(OpenNewTabTool):
    pass

@register_tool(SwitchToTabTool().get_tool_definition())
class RegisteredSwitchToTabTool(SwitchToTabTool):
    pass

@register_tool(CloseCurrentTabTool().get_tool_definition())
class RegisteredCloseCurrentTabTool(CloseCurrentTabTool):
    pass 