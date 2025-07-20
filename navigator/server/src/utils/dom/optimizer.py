import logging

from typing import Dict, List, Tuple, Any


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
) -> Tuple[Dict[int, str], Dict[int, Dict[str, Any]], Dict[str, str]]:
    """
    The final, corrected optimizer that includes all interactive elements and adds
    element_id to every rendered node.
    """
    optimized_dict = {}
    element_data: Dict[int, Dict[str, Any]] = {}
    url_map: Dict[str, str] = {}
    url_counter = 0

    interactive_text_limit = 300
    context_text_limit = 1500 if detail_level == 'summary' else 500

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

    excluded_attrs = {'style', 'width', 'height', 'bgcolor', 'color', 'align', 'valign', 'border', 'margin', 'padding', 'font-family', 'font-size', 'line-height', 'background', 'background-color', 'background-image', 'cursor', 'display', 'float', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'opacity', 'transform', 'transition', 'animation'}
    url_attrs = {'href', 'src', 'data-src', 'action'}

    def filter_classes(value) -> str:
        if not value:
            return ''
        classes = value.split() if isinstance(value, str) else value
        style_keywords = ['bg', 'text', 'font', 'color', 'border', 'shadow', 'flex', 'grid', 'hidden', 'visible', 'p-', 'm-', 'w-', 'h-', 'rounded', 'cursor', 'overflow', 'z-', 'opacity', 'absolute', 'relative', 'fixed', 'sticky', 'block', 'inline', 'justify', 'items', 'self', 'gap', 'col', 'row', 'md', 'lg', 'sm', 'xl']
        filtered = [cls for cls in classes if not any(kw in cls for kw in style_keywords)]
        return ' '.join(filtered)

    def _format_attributes(node: 'DOMTagNode') -> str:
        nonlocal url_counter
        tag = node.tag.lower()
        if detail_level == 'summary':
            priority_attrs = ['id', 'class', 'role', 'aria-label', 'title']
        else:
            priority_attrs = ATTRIBUTE_PRIORITY.get(
                tag, ['role', 'aria-label', 'title', 'class', 'id'])
        attr_parts = []
        for attr in priority_attrs:
            value = node.attributes.get(attr)
            if value is None or attr in excluded_attrs:
                continue
            if attr == 'class':
                display_value = filter_classes(value)
                if not display_value:
                    continue
            elif isinstance(value, list):
                value = ' '.join(value)
                display_value = value if len(value) <= 75 else value[:75] + '...'
            else:
                if attr in url_attrs and len(value) > 50:
                    truncated = value[:20] + '...' + value[-20:]
                    url_id = f'url_{url_counter}'
                    url_map[url_id] = value
                    display_value = f'{truncated} {url_id}'
                    url_counter += 1
                else:
                    display_value = value if len(value) <= 75 else value[:75] + '...'
            attr_parts.append(f"{attr}='{display_value}'")
        return " ".join(attr_parts)

    for frame_id, frame_dom in parsed_frames.items():
        if not frame_dom:
            continue

        all_child_ids = {cid for node in frame_dom.values() for cid in node.children_ids}
        root_node_ids = [nid for nid in frame_dom if nid not in all_child_ids]

        output_lines = []
        rendered_node_ids = set()
        processed_node_ids = set()

        def _traverse_and_render(node_id: int, depth: int):
            if node_id in processed_node_ids or depth > 25:
                return

            node = frame_dom.get(node_id)
            if not node:
                return

            processed_node_ids.add(node_id)
            tag = node.tag.lower()

            is_interactive = (
                node.is_interactive
                or node.attributes.get('contenteditable') == 'true'
                or node.attributes.get('role') in ['textbox', 'searchbox', 'combobox', 'listbox']
                or tag in ['input', 'textarea', 'select', 'button', 'a']
            )
            has_text = node.text_content and len(node.text_content.strip()) > 0
            is_important_tag = tag in ['h1', 'h2', 'h3', 'p', 'span', 'li', 'div', 'img']

            if node.navigator_id or is_interactive or (has_text and is_important_tag):
                navigator_str = f"navigator_id={node.navigator_id} " if node.navigator_id else ""
                attributes_str = _format_attributes(node)
                if is_interactive:
                    text = " ".join((node.text_content or "").split())[:interactive_text_limit]
                    full_text = node.text_content
                    description = f"{navigator_str}{attributes_str} text='{text}'".strip()
                    output_lines.append(
                        f"[{tag} element_id={node.element_id} {description}]")
                elif has_text:
                    text = " ".join(node.text_content.split())[:context_text_limit]
                    full_text = node.text_content
                    if len(node.text_content.split()) > context_text_limit:
                        text += '...'
                    description = f"{navigator_str}{attributes_str}".strip()
                    output_lines.append(
                        f"[{tag} element_id={node.element_id} {description}] {text}")
                elif tag == 'img':
                    alt_text = node.attributes.get('alt', 'decorative image')
                    output_lines.append(
                        f"[Image element_id={node.element_id} {navigator_str}alt='{alt_text}']")
                    full_text = None
                rendered_node_ids.add(node.element_id)

                full_attrs = {k: v for k, v in node.attributes.items() if k not in excluded_attrs}
                urls = [v for k, v in full_attrs.items() if k in url_attrs and isinstance(v, str)]
                element_data[node.element_id] = {
                    'tag': tag,
                    'attributes': full_attrs,
                    'text_content': full_text,
                    'xpath': node.xpath,
                    'navigator_id': node.navigator_id,
                    'is_interactive': node.is_interactive,
                    'child_frame_id': node.child_frame_id,
                    'urls': ','.join(urls) if urls else None,
                }

            for child_id in node.children_ids:
                _traverse_and_render(child_id, depth + 1)

        for root_id in root_node_ids:
            _traverse_and_render(root_id, 0)

        all_interactives = {nid for nid, node in frame_dom.items() if node.is_interactive}
        missed = all_interactives - rendered_node_ids
        for nid in sorted(missed):
            node = frame_dom[nid]
            tag = node.tag.lower()
            navigator_str = f"navigator_id={node.navigator_id} " if node.navigator_id else ""
            attributes_str = _format_attributes(node)
            text = " ".join((node.text_content or "").split())[:interactive_text_limit]
            description = f"{navigator_str}{attributes_str} text='{text}'".strip()
            output_lines.append(f"[{tag} element id={node.element_id} {description}]")

            full_attrs = {k: v for k, v in node.attributes.items() if k not in excluded_attrs}
            urls = [v for k, v in full_attrs.items() if k in url_attrs and isinstance(v, str)]
            element_data[node.element_id] = {
                'tag': tag,
                'attributes': full_attrs,
                'text_content': node.text_content,
                'xpath': node.xpath,
                'navigator_id': node.navigator_id,
                'is_interactive': node.is_interactive,
                'child_frame_id': node.child_frame_id,
                'urls': ','.join(urls) if urls else None,
            }

        optimized_dict[frame_id] = "\n".join(output_lines)

    return optimized_dict, element_data, url_map
