import logging

from app.api.utils.dom_parser.filters import (is_element_visible,
                                              is_interactive_element,
                                              is_text_node_visible,
                                              is_top_element)
from app.models.dom import DOMElementNode, DOMHashMap, DOMTextNode
from bs4 import BeautifulSoup, NavigableString, Tag

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger("DOM-Analyzer")


def get_xpath_for_element(element: Tag) -> str:
    """Generate an XPath for an element."""
    try:
        parts = []
        current = element

        while current and hasattr(current, 'name') and current.name:
            part = current.name.lower()

            # Add index if there are siblings with the same tag
            if current.parent:
                siblings = [sibling for sibling in current.parent.children
                            if hasattr(sibling, 'name') and sibling.name == part]

                if len(siblings) > 1:
                    index = siblings.index(current) + 1
                    part += f"[{index}]"

            parts.insert(0, part)
            current = current.parent

        # remove [document]
        parts = [part for part in parts if part != "[document]"]
        return "/" + "/".join(parts)
    except Exception as error:
        logger.error(f"Error generating XPath: {error}")
        return "/unknown"


def parse_dom(html_content: str) -> DOMHashMap:
    """
    Parse HTML content and create a DOMHashMap similar to the original JavaScript function.

    Args:
        html_content: HTML content as a string

    Returns:
        A dictionary mapping node IDs to DOMNode objects
    """
    try:
        logger.debug("Starting DOM parsing")
        dom_hash_map = {}
        current_id = 0

        soup = BeautifulSoup(html_content, 'html.parser')

        def process_node(node, parent_id=None):
            nonlocal current_id

            try:
                if node is None:
                    logger.debug("Skipping null node")
                    return -1

                node_id = current_id
                current_id += 1

                logger.debug(f"Processing node {node_id}, type: {type(node)}")

                if isinstance(node, NavigableString):
                    text = node.strip()
                    if not text:
                        logger.debug("Skipping empty text node")
                        return -1

                    is_visible = is_text_node_visible(node)
                    logger.debug(
                        f"Text node: \"{text[:20]}{'...' if len(text) > 20 else ''}\", visible: {is_visible}")

                    dom_hash_map[str(node_id)] = DOMTextNode(
                        text=text,
                        isVisible=is_visible
                    )

                    return node_id

                if isinstance(node, Tag):
                    tag_name = node.name.lower()
                    logger.debug(f"Element node: <{tag_name}>")

                    attributes = {}
                    try:
                        if node.attrs:
                            for attr_name, attr_value in node.attrs.items():
                                if isinstance(attr_value, list):
                                    attributes[attr_name] = " ".join(
                                        attr_value)
                                else:
                                    attributes[attr_name] = str(attr_value)
                        logger.debug(f"Extracted {len(attributes)} attributes")
                    except Exception as attr_error:
                        logger.error(
                            f"Error extracting attributes: {attr_error}")

                    xpath = ""
                    try:
                        xpath = get_xpath_for_element(node)
                        logger.debug(f"Generated XPath: {xpath}")
                    except Exception as xpath_error:
                        logger.error(f"Error generating XPath: {xpath_error}")
                        xpath = f"/{tag_name}"  # Fallback

                    is_interactive = is_interactive_element(node)
                    is_visible = is_element_visible(node)
                    is_top = is_top_element(node)

                    logger.debug(
                        f"Element properties - interactive: {is_interactive}, visible: {is_visible}, top: {is_top}")

                    element_node = DOMElementNode(
                        tagName=tag_name,
                        attributes=attributes,
                        xpath=xpath,
                        children=[],
                        isInteractive=is_interactive,
                        isVisible=is_visible,
                        isTopElement=is_top
                    )

                    dom_hash_map[str(node_id)] = element_node

                    try:
                        logger.debug(
                            f"Processing {len(list(node.children))} children for {tag_name}")
                        for child in node.children:
                            child_id = process_node(child, node_id)
                            if child_id != -1:
                                element_node.children.append(child_id)
                    except Exception as child_error:
                        logger.error(
                            f"Error processing children of {tag_name}: {child_error}")

                    return node_id

                return -1  # Should never reach here
            except Exception as process_error:
                logger.error(f"Error processing node: {process_error}")
                return -1

        # Start processing from the body element
        root_id = -1
        if soup.body:
            logger.debug("Starting processing from document body")
            root_id = process_node(soup.body)
        else:
            logger.error("Document body not available")

        logger.debug(
            f"DOM parsing complete, created {len(dom_hash_map)} entries")
        return dom_hash_map
    except Exception as error:
        logger.error(f"Fatal error in parse_dom: {error}")
        return {}  # Return empty object instead of failing completely
