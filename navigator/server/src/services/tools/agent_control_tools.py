from typing import Any, Dict  # noqa: F401
from src.api.schemas.tasks import Tool, ToolParameter
from .base_tool import BaseTool
from .tools_registry import register_tool


class AnswerUserTool(BaseTool):
    """Tool for providing final answers to users"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="answer_user",
            name="Answer User",
            description="Provide the final answer or result to the user. Use only when the task is complete or the answer is fully known. Return concise, complete text.",
            parameters=[
                ToolParameter(
                    name="text",
                    type="str",
                    description="The complete answer or information to present to the user"
                )
            ]
        )

class AskUserForClarificationTool(BaseTool):
    """Tool for requesting clarification from users"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="ask_user_for_clarification",
            name="Ask User for Clarification",
            description="Ask the user a specific clarifying question when there is ambiguity that blocks progress. Keep questions concrete and reference the visible options if relevant.",
            parameters=[
                ToolParameter(
                    name="question",
                    type="str",
                    description="The specific question to ask the user for clarification (e.g., 'I see two Submit buttons. Which one should I click?')"
                )
            ]
        )
    

class TaskCompleteTool(BaseTool):
    """Tool for marking tasks as successfully completed"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="task_complete",
            name="Task Complete",
            description="Mark the task as successfully completed and provide a short summary of what was accomplished.",
            parameters=[
                ToolParameter(
                    name="summary",
                    type="str", 
                    description="A brief summary of what was accomplished during the task execution"
                )
            ]
        )
    

class TaskFailedTool(BaseTool):
    """Tool for indicating task failure"""
    
    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="task_failed",
            name="Task Failed",
            description="Indicate task failure with a clear reason (e.g., CAPTCHA, auth required, element missing). Use after reasonable retries have failed.",
            parameters=[
                ToolParameter(
                    name="reason",
                    type="str",
                    description="A clear explanation of why the task could not be completed (e.g., 'Encountered CAPTCHA verification', 'Required element not found after scrolling')"
                )
            ]
        )
    

# Register all tools
@register_tool(AnswerUserTool().get_tool_definition())
class RegisteredAnswerUserTool(AnswerUserTool):
    pass

@register_tool(AskUserForClarificationTool().get_tool_definition())
class RegisteredAskUserForClarificationTool(AskUserForClarificationTool):
    pass

@register_tool(TaskCompleteTool().get_tool_definition())
class RegisteredTaskCompleteTool(TaskCompleteTool):
    pass

@register_tool(TaskFailedTool().get_tool_definition())
class RegisteredTaskFailedTool(TaskFailedTool):
    pass 


class UpdateScratchpadTool(BaseTool):
    """Tool for updating the task-specific scratchpad"""

    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="update_scratchpad",
            name="Update Scratchpad",
            description="Update the free-form scratchpad notes for the current task. Use 'append' to add to existing content or 'replace' to overwrite.",
            parameters=[
                ToolParameter(
                    name="text",
                    type="str",
                    description="The note text to append or set into the scratchpad"
                ),
                ToolParameter(
                    name="mode",
                    type="str",
                    description="One of 'append' | 'replace'. Default: append",
                    required=False,
                    default="append"
                )
            ]
        )


class AddTodoTool(BaseTool):
    """Tool for adding a todo item to the task todo list"""

    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="add_todo",
            name="Add Todo",
            description="Add a new todo item that helps achieve the user's goal. Keep todos small, concrete actions.",
            parameters=[
                ToolParameter(
                    name="text",
                    type="str",
                    description="The todo item text"
                ),
                ToolParameter(
                    name="priority",
                    type="int",
                    description="Optional priority where higher is more urgent. Default 0",
                    required=False,
                    default=0
                )
            ]
        )


class MarkTodoDoneTool(BaseTool):
    """Tool for marking a todo item done by index"""

    def get_tool_definition(self) -> Tool:
        return Tool(
            tool_id="mark_todo_done",
            name="Mark Todo Done",
            description="Mark a todo item as done by its zero-based index in the current todo list.",
            parameters=[
                ToolParameter(
                    name="index",
                    type="int",
                    description="Zero-based index of the todo to mark done"
                )
            ]
        )


@register_tool(UpdateScratchpadTool().get_tool_definition())
class RegisteredUpdateScratchpadTool(UpdateScratchpadTool):
    pass


@register_tool(AddTodoTool().get_tool_definition())
class RegisteredAddTodoTool(AddTodoTool):
    pass


@register_tool(MarkTodoDoneTool().get_tool_definition())
class RegisteredMarkTodoDoneTool(MarkTodoDoneTool):
    pass