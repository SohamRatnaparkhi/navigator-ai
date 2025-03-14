from typing import Dict, List, Optional

from app.api.utils.dom_parser.dom_optimizer import generate_highlight_style_dom
from app.api.utils.dom_parser.optimizer2 import generate_fixed_highlight_dom
from app.api.utils.dom_parser.optimizer3 import generate_enhanced_highlight_dom
from app.models.dom import DOMState

def build_system_prompt():
    prompt = """You are an AI browser named Navigator AI. You are an automation assistant designed to help users accomplish tasks on websites. Your goal is to accurately interact with web elements to complete the user's ultimate task.

# INPUT INFORMATION
You will receive:
1. The user's task description
2. The current URL of the web page
3. Interactive elements on the page with unique element IDs (E1, E2, etc.)
4. History of previous actions (if any)
5. Results of the last action (if any)

# ELEMENT INTERACTION RULES
- Interactive elements are marked with IDs like [E1], [E2], etc.
- ONLY elements with these IDs can be interacted with
- The element description includes: tag type, key attributes, and visible text
- Example: [E5]<input type=text placeholder="Search..."/>

# RESPONSE FORMAT
You MUST ALWAYS respond with valid JSON in this exact format:
```json
{
  "current_state": {
    "page_summary": "Detailed summary of the current page focused on information relevant to the task. Be specific and factual.",
    "evaluation_previous_goal": "Success|Failed|Unknown - Analyze if previous actions succeeded based on the current page state. Mention any unexpected behaviors (like suggestions appearing, redirects, etc.).",
    "next_goal": "Specific immediate goal for the next action(s)"
  },
  "actions": [
    {
      "type": "ACTION_TYPE (click|input|scroll|url)",
      "element_id": "E5",  // Use EXACT element ID as shown in the page description
      "text": "TEXT_TO_INPUT",  // Only for 'input' actions
      "amount": NUMBER,  // Only for 'scroll' actions (pixels)
      "url": "URL"  // Only for 'url' actions
    }
  ],
  "is_done": true/false  // Only true when the entire task is complete
}"""
    return prompt

def build_user_message(dom_state, task=None, history=None, result=None):
    """
    Build an optimized user message for LLM with highlight-style DOM representation.
    
    Args:
        dom_state: The DOM state object
        task: The user's task (optional)
        history: Previous action history (optional)
        result: Result of the last action (optional)
        
    Returns:
        Tuple of (content, xpath_map, selector_map)
    """
    key_attributes = ['id', 'name', 'type', 'value', 'placeholder', 'href']
    
    dom_content, xpath_map, selector_map = generate_enhanced_highlight_dom(
        dom_state, include_attributes=key_attributes)
    
    content = ""
    
    if task:
        content += f"MAIN TASK (END GOAL): {task}\n\n"
    
    content += f"CURRENT URL: {dom_state.url}\n\n"
    
    content += "INTERACTIVE ELEMENTS:\n"
    content += "(Only elements with [E#] IDs can be interacted with)\n"
    content += f"{dom_content}\n"
    
    if history and len(history) > 0:
        content += "\nACTION HISTORY:\n"
        
        for i, step in enumerate(history):
            if not isinstance(step, dict):
                print(f"Warning: Invalid history step format: {type(step)}")
                continue
                
            content += f"Step {i+1}: URL: {step.get('url', 'unknown')}\n"
            actions = step.get('actions', [])
            
            if not actions:
                print(f"Warning: No actions in history step {i+1}")
                continue
                
            if not isinstance(actions, list):
                print(f"Warning: Actions not a list in step {i+1}: {type(actions)}")
                if isinstance(actions, dict):
                    actions = [actions]
                else:
                    continue
            
            for action in actions:
                if not isinstance(action, dict):
                    print(f"Warning: Invalid action format in step {i+1}: {type(action)}")
                    continue
                    
                action_str = f"  - {action.get('type', '').upper()}"
                
                if 'element_id' in action:
                    action_str += f" element [{action['element_id']}]"
                elif 'xpath_ref' in action and 'selector' in action:
                    action_str += f" element with selector: {action['selector']}"
                
                if 'text' in action and action['text']:
                    action_str += f" with text: '{action['text']}'"
                if 'url' in action and action['url']:
                    action_str += f" to URL: {action['url']}"
                if 'amount' in action:
                    action_str += f" by {action['amount']} pixels"
                
                content += action_str + "\n"
            content += "\n"
    
    if result:
        content += f"RESULT OF LAST ACTION:\n{result}\n"
        
    content += "\nREMINDERS:\n"
    content += "- Use EXACT element IDs (E1, E2, etc.) as shown above\n"
    content += "- For input actions, include both element_id and text\n"
    content += "- Only set is_done:true when the entire task is complete\n"
    
    return content, xpath_map, selector_map