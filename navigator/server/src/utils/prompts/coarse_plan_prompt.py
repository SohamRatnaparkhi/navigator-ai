from typing import List


def get_coarse_plan_prompt(query: str, url: str, open_tabs_with_ids: List[str], current_tab: str) -> str:
    return (
        "You are an assistant creating a brief plan preview for a browser automation agent. "
        "The agent can navigate websites, interact with elements, and complete tasks. "
        "Based on the user's query and current browser state, create a realistic step-by-step plan. "
        "\n\nGuidelines:\n"
        "- Write a descriptive title that summarizes the overall goal\n"
        "- Provide 2-4 concrete, actionable steps in logical order\n"
        "- Each step should be specific about what action will be taken\n"
        "- Consider the current URL and available tabs when planning\n"
        "- Steps should be realistic and achievable with browser automation\n"
        "- Focus on the most direct path to complete the user's request\n"
        "- If navigation to a different page is needed, include that as a step\n"
        "- If form filling or clicking specific elements is required, mention that\n"
        "\nAvailable actions include: navigating to URLs, clicking elements, filling forms, "
        "scrolling, switching tabs, and extracting information.\n\n"
        f"User query: {query}\n"
        f"Starting URL: {url}\n"
        f"Open tabs (ids or urls): {open_tabs_with_ids}\n"
        f"Current tab: {current_tab}\n\n"
        "Return ONLY JSON with shape {\"title\": string, \"steps\": [{\"title\": string, \"description\": string}]}"
    )


