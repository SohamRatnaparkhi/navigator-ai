import logging

from bs4 import NavigableString, Tag

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("DOM-Analyzer")
logger.setLevel(logging.INFO)


unaccepted_leaf_element_tags_set = {
    "script", "style", "meta", "link", "iframe", "svg", "canvas", "video", "audio"
}


def tag_wise_filter(element_tag: str) -> bool:
    """Filter elements based on their tag name."""
    try:
        if not element_tag:
            logger.debug("Empty element tag provided to tag_wise_filter")
            return False

        normalized_tag = element_tag.lower()
        logger.debug(f"Checking tag filter for: {normalized_tag}")

        if normalized_tag in unaccepted_leaf_element_tags_set:
            logger.debug(f"Tag {normalized_tag} is in unaccepted set")
            return False

        logger.debug(f"Tag {normalized_tag} is accepted")
        return True
    except Exception as error:
        logger.error(f"Error in tag_wise_filter: {error}")
        return True

def is_element_visible(element: Tag) -> bool:
    """
    Estimate if an element is likely visible based on HTML attributes.
    This is a simplified version since we don't have access to rendered styles in Python.
    """
    try:
        if not element:
            logger.debug("Null element provided to is_element_visible")
            return False

        tag_name = element.name.lower() if element.name else ""
        logger.debug(f"Checking visibility for {tag_name}")

        style_attr = element.get('style', '')
        if 'display:none' in style_attr.lower() or 'visibility:hidden' in style_attr.lower():
            return False

        if element.get('hidden') is not None or element.get('aria-hidden') == 'true':
            return False

        class_attr = element.get('class', [])
        class_names = class_attr if isinstance(
            class_attr, list) else str(class_attr).split()
        hidden_classes = ['hidden', 'invisible', 'displaynone', 'nodisplay']
        if any(hidden_class in class_name.lower() for class_name in class_names for hidden_class in hidden_classes):
            return False

        logger.debug(f"Element visibility result: True")
        return True
    except Exception as error:
        logger.error(f"Error in is_element_visible: {error}")
        return True

def is_top_element(element: Tag) -> bool:
    """
    Simplified version of isTopElement since we can't determine stacking in static HTML.
    Assumes elements are top unless they have specific attributes suggesting otherwise.
    """
    try:
        if not element:
            logger.debug("Null element provided to is_top_element")
            return False

        tag_name = element.name.lower() if element.name else ""
        logger.debug(f"Checking if {tag_name} is top element")

        if tag_name in ['body', 'html']:
            return False

        style_attr = element.get('style', '').lower()
        if 'z-index:-' in style_attr or 'z-index: -' in style_attr:
            return False

        return True
    except Exception as error:
        logger.error(f"Error in is_top_element: {error}")
        return True

def is_text_node_visible(text_node: NavigableString) -> bool:
    """Check if a text node is likely visible."""
    try:
        if not text_node or not text_node.strip():
            logger.debug("Null or empty text node provided")
            return False

        logger.debug("Checking text node visibility")

        parent = text_node.parent
        if not parent or not is_element_visible(parent):
            return False

        return True
    except Exception as error:
        logger.error(f"Error in is_text_node_visible: {error}")
        return True

def is_interactive_element(element: Tag) -> bool:
    """Check if an element is interactive based on its tag and attributes."""
    try:
        if not element:
            logger.debug("Null element provided to is_interactive_element")
            return False

        tag_name = element.name.lower() if element.name else ""
        logger.debug(f"Checking if {tag_name} is interactive")

        if tag_name == "body":
            logger.debug("Body tag is not interactive")
            return False

        interactive_elements = {
            "a", "button", "details", "embed", "input", "label",
            "menu", "menuitem", "object", "select", "textarea", "summary"
        }

        interactive_roles = {
            "button", "menu", "menuitem", "link", "checkbox", "radio",
            "slider", "tab", "tabpanel", "textbox", "combobox", "grid",
            "listbox", "option", "progressbar", "scrollbar", "searchbox",
            "switch", "tree", "treeitem", "spinbutton", "tooltip",
            "a-button-inner", "a-dropdown-button", "click", "menuitemcheckbox",
            "menuitemradio", "a-button-text", "button-text", "button-icon",
            "button-icon-only", "button-text-icon-only", "dropdown", "combobox"
        }

        role = element.get('role', '')
        aria_role = element.get('aria-role', '')
        tab_index = element.get('tabindex')

        classes = element.get('class', [])
        class_list = classes if isinstance(
            classes, list) else str(classes).split()
        has_address_input_class = "address-input__container__input" in class_list

        parent_tag = element.parent.name.lower(
        ) if element.parent and element.parent.name else ""
        has_interactive_role = (
            has_address_input_class or
            tag_name in interactive_elements or
            role in interactive_roles or
            aria_role in interactive_roles or
            (tab_index is not None and tab_index != "-1" and parent_tag != "body") or
            element.get('data-action') == "a-dropdown-select" or
            element.get('data-action') == "a-dropdown-button"
        )

        if has_interactive_role:
            logger.debug(f"Element has interactive role: {tag_name}")
            return True

        has_click_handler = (
            element.get('onclick') is not None or
            element.has_attr('ng-click') or
            element.has_attr('@click') or
            element.has_attr('v-on:click')
        )

        has_aria_props = (
            element.has_attr('aria-expanded') or
            element.has_attr('aria-pressed') or
            element.has_attr('aria-selected') or
            element.has_attr('aria-checked')
        )

        is_draggable = element.get('draggable') == "true"

        if tag_name == "body" or parent_tag == "body":
            logger.debug(
                "Element is body or direct child of body - not interactive")
            return False

        is_interactive = (
            has_aria_props or
            has_click_handler or
            is_draggable
        )

        logger.debug(
            f"Element interactivity: {is_interactive} (ariaProps: {has_aria_props}, clickHandler: {has_click_handler}, draggable: {is_draggable})")
        return is_interactive
    except Exception as error:
        logger.error(f"Error in is_interactive_element: {error}")
        return True
