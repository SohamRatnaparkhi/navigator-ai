from src.api.schemas.tasks import Tool, ToolParameter
from .base_tool import BaseTool
from .tools_registry import register_tool


class GenerateDocTool(BaseTool):
    """Tool for generating documents"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="generate_doc",
            name="Generate Document",
            description="Creates a formatted document (DOC/DOCX) with the provided content and title. Supports rich text formatting, headers, lists, and standard document structures. Perfect for reports, letters, or any text-based documents.",
            parameters=[
                ToolParameter(
                    name="content",
                    type="str",
                    description="The main content of the document in markdown or rich text format"
                ),
                ToolParameter(
                    name="title",
                    type="str",
                    description="The title/header of the document"
                )
            ]
        )
    

class GeneratePptTool(BaseTool):
    """Tool for generating presentations"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="generate_ppt",
            name="Generate Presentation",
            description="Creates a PowerPoint presentation (PPT/PPTX) with multiple slides from structured data. Each slide can contain titles, content, bullet points, and basic formatting. Ideal for business presentations, educational content, or slide-based reports.",
            parameters=[
                ToolParameter(
                    name="slides_data",
                    type="list",
                    description="Array of slide objects, each containing title, content, and optional formatting. Format: [{'title': 'Slide Title', 'content': 'Slide content or bullet points', 'layout': 'title_content'}]"
                )
            ]
        )
    

class GenerateSheetTool(BaseTool):
    """Tool for generating spreadsheets"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="generate_sheet",
            name="Generate Spreadsheet",
            description="Creates an Excel spreadsheet (XLS/XLSX) from CSV data or structured tabular information. Supports multiple sheets, basic formatting, formulas, and data organization. Perfect for data analysis, reports, budgets, or any tabular data presentation.",
            parameters=[
                ToolParameter(
                    name="csv_data",
                    type="str",
                    description="The tabular data in CSV format with headers and rows. Each line represents a row, with comma-separated values."
                )
            ]
        )
    

# Register all tools
@register_tool(GenerateDocTool().get_tool_definition())
class RegisteredGenerateDocTool(GenerateDocTool):
    pass

@register_tool(GeneratePptTool().get_tool_definition())
class RegisteredGeneratePptTool(GeneratePptTool):
    pass

@register_tool(GenerateSheetTool().get_tool_definition())
class RegisteredGenerateSheetTool(GenerateSheetTool):
    pass 