"""
Browser Automation Tools Package

This package contains all the browser automation tools organized by category:
- Core Browsing Tools: Click, Type, Select, Hover, Scroll, Upload
- Navigation Tools: URL navigation, tab management, history
- Data Extraction Tools: Text extraction, table parsing, screenshots
- Agent Control Tools: Task completion, user interaction, error handling
- Generation Tools: Document, presentation, and spreadsheet creation

All tools are automatically registered when this package is imported.
"""

# Import all tool modules to register them
from .base_tool import BaseTool
from .tools_registry import ToolsRegistry, register_tool

# Import all tool implementations to trigger registration
from . import core_browsing_tools
from . import navigation_tools  
from . import data_extraction_tools
from . import agent_control_tools
from . import generation_tools

__all__ = [
    'BaseTool',
    'ToolsRegistry', 
    'register_tool',
    'core_browsing_tools',
    'navigation_tools',
    'data_extraction_tools', 
    'agent_control_tools',
    'generation_tools'
] 