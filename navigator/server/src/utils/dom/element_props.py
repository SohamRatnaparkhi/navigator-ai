import logging
from bs4 import Tag

from src.api.schemas.dom import DOMMetadata, DOMTagNode

logger = logging.getLogger(__name__)


def get_xpath_for_element(element: Tag) -> str:
    """Generate an XPath for an element."""
    try:
        parts = []
        current = element

        while current and hasattr(current, 'name') and current.name:
            part = current.name.lower()

            if current.parent:
                siblings = [sibling for sibling in current.parent.children
                            if hasattr(sibling, 'name') and sibling.name == part]

                if len(siblings) > 1:
                    index = siblings.index(current) + 1
                    part += f"[{index}]"

            parts.insert(0, part)
            current = current.parent

        parts = [part for part in parts if part != "[document]"]
        return "/" + "/".join(parts)
    except Exception as error:
        logger.error(f"Error generating XPath: {error}")
        return "/unknown"


def is_element_interactive(element: Tag, metadata: DOMMetadata | None) -> bool:
    if metadata and metadata.cursor == 'pointer':
        return True
    tag_name = element.name.lower()
    native_interactive_tags = {"button", "input",
                               "select", "textarea", "details", "summary", "a"}
    if tag_name in native_interactive_tags:
        return False if tag_name == 'a' and not element.attrs.get('href') else True
    if element.attrs.get('contenteditable', 'false').lower() == 'true':
        return True
    interactive_roles = {"button", "link", "checkbox", "menuitem",
                         "option", "radio", "slider", "tab", "textbox", "switch", "combobox"}
    if element.attrs.get('role') in interactive_roles:
        return True
    if any(attr in element.attrs for attr in ['onclick', '@click', 'v-on:click']):
        return True
    tab_index = element.attrs.get('tabindex')
    if tab_index is not None and str(tab_index) != "-1":
        return True
    return False


def is_likely_captcha(element: Tag) -> bool:
    """
    Determine if an element is part of a CAPTCHA.
    """
    captcha_identifiers = ['captcha', 'recaptcha', 'hcaptcha', 'turnstile']
    for attr_value in element.attrs.values():
        if isinstance(attr_value, str) and any(identifier in attr_value for identifier in captcha_identifiers):
            return True
        if isinstance(attr_value, list) and any(identifier in item for item in attr_value for identifier in captcha_identifiers):
            return True

    if element.name.lower() == 'iframe':
        iframe_src = element.attrs.get('src', '')
        if iframe_src and any(identifier in iframe_src for identifier in captcha_identifiers):
            return True

    element_text = element.get_text(separator=" ", strip=True).lower()
    captcha_phrases = ["i'm not a robot",
                       "verify you are human", "select all images"]
    if any(phrase in element_text for phrase in captcha_phrases):
        return True

    return False


def is_distinct_interaction(node: DOMTagNode) -> bool:
    """
    Determines if an element represents a new, distinct interaction from its parent.
    These elements should NOT be suppressed.
    """
    tag = node.tag.lower()
    # Native form elements are always distinct interactions.
    if tag in {"input", "textarea", "select", "button", "a", "details", "summary"}:
        return True

    # A contenteditable element is a distinct interaction.
    if node.attributes.get('contenteditable', 'false').lower() == 'true':
        return True

    # Specific interactive roles are distinct.
    interactive_roles = {"button", "link", "checkbox", "menuitem",
                         "option", "radio", "slider", "tab", "textbox", "switch", "combobox", "searchbox"}
    if node.attributes.get('role') in interactive_roles:
        return True

    if node.attributes.get('onclick') or node.attributes.get('@click') or node.attributes.get('v-on:click'):
        return True

    if node.attributes.get('tabindex') is not None and str(node.attributes.get('tabindex')) != "-1":
        return True

    return False
