import logging

from typing import Dict, List, Tuple


from src.api.schemas.dom import DOMTagNode

logger = logging.getLogger(__name__)

def dom_optimizer(
    parsed_frames: Dict[int, Dict[int, 'DOMTagNode']],
    detail_level: str = 'detailed',  # 'summary' for asking, 'detailed' for browsing
    main_frame_id: int = 0
) -> Tuple[str, Dict[str, str]]:
    """
    Transforms the complex parsed DOM into a simplified, token-efficient, and
    LLM-friendly string representation.

    Args:
        parsed_frames: The full output from your parse_full_dom function.
        detail_level: 'summary' for a text-rich view, 'detailed' for an action-focused view.
        main_frame_id: The ID of the frame to start processing from.

    Returns:
        A tuple containing:
        - A string representing the simplified DOM.
        - A dictionary mapping url_ids to their full URL.
    """
    if not parsed_frames or main_frame_id not in parsed_frames:
        return "No content found on the page.", {}

    output_lines = []
    processed_node_ids = set()
    url_map: Dict[str, str] = {}
    url_counter = 0

    text_limit = 1000 if detail_level == 'summary' else 250
    interactive_text_limit = 80

    ATTRIBUTE_PRIORITY = {
        'input': ['type', 'placeholder', 'name', 'aria-label', 'title', 'value'],
        'a': ['href', 'title', 'aria-label'],
        'button': ['name', 'aria-label', 'title'],
        'textarea': ['placeholder', 'name', 'aria-label', 'title'],
        'select': ['name', 'aria-label', 'title'],
        'img': ['alt', 'src'],
    }

    def _format_attributes(node: 'DOMTagNode') -> str:
        """Helper to format the most important attributes for an element."""
        nonlocal url_counter
        if detail_level == 'summary':
            return ""

        tag = node.tag.lower()
        priority_attrs = ATTRIBUTE_PRIORITY.get(
            tag, ['name', 'aria-label', 'title'])

        attr_parts = []
        for attr in priority_attrs:
            value = node.attributes.get(attr)
            if value and isinstance(value, str):
                if (attr == 'href' or attr == 'src') and len(value) > 100:
                    url_id = f"url_{url_counter}"
                    url_map[url_id] = value
                    display_value = url_id
                    url_counter += 1
                else:
                    display_value = (
                        value[:75] + '...') if len(value) > 75 else value

                attr_parts.append(f"{attr}='{display_value}'")

        return " ".join(attr_parts)

    def _traverse_and_render(node_id: int, frame_id: int, depth: int):
        """Recursively traverses the DOM tree and builds the string."""
        if node_id in processed_node_ids or depth > 20:
            return

        node = parsed_frames.get(frame_id, {}).get(node_id)
        if not node:
            logger.warning(f"No node found for node_id {node_id} in frame {frame_id}")
            return

        processed_node_ids.add(node_id)

        tag = node.tag.lower()
        indent = "  " * depth

        if node.is_interactive:
            text = node.text_content or ""
            text = " ".join(text.split())[:interactive_text_limit]
            attributes_str = _format_attributes(node)
            description = f"{attributes_str} text='{text}'".strip()
            output_lines.append(
                f"{indent}[{tag.capitalize()} id={node.element_id} {description}]")

        elif tag in ['h1', 'h2', 'h3', 'p', 'span', 'li', 'div'] and node.text_content:
            text = " ".join(node.text_content.split())
            if text:
                display_text = (text[:text_limit] +
                                '...') if len(text) > text_limit else text
                output_lines.append(f"{indent}[{tag}] {display_text}")

        elif tag == 'img':
            alt_text = node.attributes.get('alt', 'decorative image')
            output_lines.append(f"{indent}[Image alt='{alt_text}']")

        for child_id in node.children_ids:
            logger.info(f"Traversing child node {child_id} of node {node_id} in frame {frame_id}")
            _traverse_and_render(child_id, frame_id, depth + 1)

        if node.child_frame_id is not None and node.child_frame_id in parsed_frames:
            output_lines.append(
                f"\n{indent}--- Start iFrame id={node.child_frame_id} ---")
            child_frame_dom = parsed_frames[node.child_frame_id]
            root_child_node_id = next(iter(child_frame_dom.keys()), None)
            if root_child_node_id:
                _traverse_and_render(root_child_node_id,
                                     node.child_frame_id, depth + 1)
            output_lines.append(
                f"{indent}--- End iFrame id={node.child_frame_id} ---\n")

    main_frame_dom = parsed_frames.get(main_frame_id, {})
    if main_frame_dom:
        all_child_ids = set(
            child_id
            for node in main_frame_dom.values()
            for child_id in node.children_ids
        )
        root_node_ids = [
            node_id for node_id in main_frame_dom.keys() if node_id not in all_child_ids
        ]

        if not root_node_ids:
            logger.warning(
                f"Could not determine root node for frame {main_frame_id}. The DOM may be malformed."
            )
        else:
            for root_id in root_node_ids:
                logger.info(
                    f"Traversing DOM for frame {main_frame_id} starting from root node {root_id}")
                _traverse_and_render(root_id, main_frame_id, 0)
    else:
        logger.warning(f"No DOM found for frame {main_frame_id}")

    return "\n".join(output_lines), url_map


def advanced_dom_optimizer(
    parsed_frames: Dict[int, Dict[int, 'DOMTagNode']],
    detail_level: str,
    main_frame_id: int = 0
) -> Tuple[str, Dict[str, str]]:
    """
    The final, corrected optimizer that includes all interactive elements and adds
    element_id to every rendered node.
    """
    output_lines = []
    processed_node_ids = set()
    url_map: Dict[str, str] = {}
    url_counter = 0

    interactive_text_limit = 150
    context_text_limit = 1000 if detail_level == 'summary' else 250

    ATTRIBUTE_PRIORITY = {
        'input': ['type', 'placeholder', 'name', 'aria-label', 'title', 'value', 'class', 'id'],
        'a': ['href', 'title', 'aria-label', 'class', 'id'],
        'button': ['name', 'aria-label', 'title', 'class', 'id'],
        'textarea': ['placeholder', 'name', 'aria-label', 'title', 'class', 'id'],
        'select': ['name', 'aria-label', 'title', 'class', 'id'],
        'img': ['alt', 'src'],
        'div': ['role', 'aria-label', 'title', 'class', 'id'],
        'span': ['role', 'aria-label', 'title', 'class', 'id'],
    }

    def _format_attributes(node: 'DOMTagNode') -> str:
        nonlocal url_counter
        if detail_level == 'summary':
            return ""

        tag = node.tag.lower()
        priority_attrs = ATTRIBUTE_PRIORITY.get(
            tag, ['role', 'aria-label', 'title', 'class', 'id'])
        attr_parts = []
        for attr in priority_attrs:
            value = node.attributes.get(attr)
            if isinstance(value, list): 
                value = " ".join(value)

            if value and isinstance(value, str):
                if (attr == 'href' or attr == 'src') and len(value) > 100:
                    url_id = f"url_{url_counter}"
                    url_map[url_id] = value
                    display_value = url_id
                    url_counter += 1
                else:
                    display_value = (
                        value[:75] + '...') if len(value) > 75 else value
                attr_parts.append(f"{attr}='{display_value}'")
        return " ".join(attr_parts)

    def _get_all_descendants(node_id: int, frame_id: int) -> List[int]:
        descendants = []
        q = [node_id]
        visited = {node_id}

        start_node = parsed_frames.get(frame_id, {}).get(node_id)
        if not start_node:
            return []

        q = list(start_node.children_ids)
        visited.update(q)
        descendants.extend(q)

        while q:
            curr_id = q.pop(0)
            node = parsed_frames.get(frame_id, {}).get(curr_id)
            if node:
                for child_id in node.children_ids:
                    if child_id not in visited:
                        visited.add(child_id)
                        descendants.append(child_id)
                        q.append(child_id)
        return descendants

    def _traverse_and_render(node_id: int, frame_id: int, depth: int):
        if node_id in processed_node_ids or depth > 25:
            return

        node = parsed_frames.get(frame_id, {}).get(node_id)
        if not node:
            return

        processed_node_ids.add(node_id)
        tag = node.tag.lower()
        indent = "  " * depth

        should_traverse_children = False

        if node.is_interactive:
            text = " ".join((node.text_content or "").split())[
                :interactive_text_limit]
            attributes_str = _format_attributes(node)
            description = f"{attributes_str} text='{text}'".strip()
            output_lines.append(
                f"{indent}[{tag.capitalize()} id={node.element_id} {description}]")
            should_traverse_children = True
        else:
            has_interactive_descendant = any(
                parsed_frames.get(frame_id, {}).get(desc_id, {}).is_interactive
                for desc_id in _get_all_descendants(node_id, frame_id)
            )

            if has_interactive_descendant:
                should_traverse_children = True
            else:
                if tag in ['h1', 'h2', 'h3', 'p', 'span', 'li', 'div'] and node.text_content:
                    text = " ".join(node.text_content.split())
                    if text:
                        display_text = (
                            text[:context_text_limit] + '...') if len(text) > context_text_limit else text
                        output_lines.append(
                            f"{indent}[{tag.capitalize()} id={node.element_id}] {display_text}")
                elif tag == 'img':
                    alt_text = node.attributes.get('alt', 'decorative image')
                    output_lines.append(
                        f"{indent}[Image id={node.element_id} alt='{alt_text}']")

        if should_traverse_children:
            for child_id in node.children_ids:
                _traverse_and_render(child_id, frame_id, depth + 1)

        if node.child_frame_id is not None and node.child_frame_id in parsed_frames:
            output_lines.append(
                f"\n{indent}--- Start iFrame id={node.child_frame_id} ---")
            child_frame_dom = parsed_frames[node.child_frame_id]
            all_child_ids = {cid for n in child_frame_dom.values()
                             for cid in n.children_ids}
            root_node_ids = [
                nid for nid in child_frame_dom if nid not in all_child_ids]
            for root_id in root_node_ids:
                _traverse_and_render(root_id, node.child_frame_id, depth + 1)
            output_lines.append(
                f"{indent}--- End iFrame id={node.child_frame_id} ---\n")

    main_frame_dom = parsed_frames.get(main_frame_id, {})
    if main_frame_dom:
        all_child_ids = {cid for node in main_frame_dom.values()
                         for cid in node.children_ids}
        root_node_ids = [
            nid for nid in main_frame_dom if nid not in all_child_ids]
        for root_id in root_node_ids:
            _traverse_and_render(root_id, main_frame_id, 0)

    return "\n".join(output_lines), url_map
