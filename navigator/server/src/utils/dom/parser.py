import logging
from typing import Dict, List, Tuple

from bs4 import BeautifulSoup, NavigableString, Tag

from src.utils.dom.optimizer import advanced_dom_optimizer, dom_optimizer
from src.api.schemas.dom import DOMMetadata, DOMTagNode, DOMTextNode, FullDOMData
from src.utils.dom.element_props import get_xpath_for_element, is_distinct_interaction, is_element_interactive, is_likely_captcha


logger = logging.getLogger(__name__)



def parse_dom(dom: str):
    try:
        soup = BeautifulSoup(dom, 'html.parser')

        processed_dom = {}
        current_id = 0

        def process_node(node: Tag | None):
            nonlocal current_id

            try:
                if node is None:
                    return -1
                
                if isinstance(node, NavigableString):
                    current_node = DOMTextNode(
                        element_id=current_id,
                        text=node.string
                    )

                    processed_dom[current_id] = current_node
                    return -1
                
                if isinstance(node, Tag):
                    current_node = DOMTagNode(
                        element_id=current_id,
                        tag=node.name,
                        attributes=node.attrs,
                        children_ids=[],
                        is_interactive=False,
                        is_visible=False,
                        xpath=get_xpath_for_element(node)
                    )
                    current_id += 1

                    processed_dom[current_id] = current_node
                    for child in node.children:
                        child_id = process_node(child)
                        if child_id is not None:
                            current_node.children_ids.append(child_id)
                    return current_node
            except Exception as e:
                logger.error(f"Error processing node: {node} {e}")
                return -1

        process_node(soup)

        return processed_dom
    except Exception as e:
        logger.error(f"Error parsing DOM: {e}")
        return None


def parse_full_dom(dom_data: FullDOMData) -> Tuple[Dict[int, Dict[int, DOMTagNode]], str]:
    logger.info(
        f"Starting DOM parsing for URL: {dom_data.url} with {len(dom_data.frames)} frames.")
    parsed_frames: Dict[int, Dict[int, DOMTagNode]] = {
        frame.frame_id: {} for frame in dom_data.frames}
    
    textual_content = ""
    global_element_id_counter = 0
    iframe_src_to_frame_id: Dict[str, int] = {
        frame.url: frame.frame_id for frame in dom_data.frames if frame.frame_id != 0
    }

    # --- Pass 1: Build the structural tree for each frame ---
    for frame in dom_data.frames:
        logger.debug(f"Processing frame {frame.frame_id}...")
        soup = BeautifulSoup(frame.html, 'html.parser')

        nav_id_to_bs4_element: Dict[str, Tag] = {
            tag.attrs['data-navigator-id']: tag for tag in soup.find_all(attrs={'data-navigator-id': True})
        }

        def _build_tree(node: Tag) -> int | None:
            nonlocal global_element_id_counter
            nonlocal textual_content
            
            if not isinstance(node, Tag):
                return None

            element_id = global_element_id_counter
            global_element_id_counter += 1

            full_text = node.get_text(separator=' ', strip=True)
            direct_text_nodes = node.find_all(string=True, recursive=False)
            direct_text = ' '.join(s.strip() for s in direct_text_nodes).strip()

            if full_text:
                textual_content += full_text

            dom_node = DOMTagNode(
                element_id=element_id,
                tag=node.name,
                attributes=node.attrs,
                xpath=get_xpath_for_element(node),
                text_content=direct_text if direct_text else None,
                is_likely_captcha=is_likely_captcha(node)
            )

            if node.name.lower() == 'iframe':
                iframe_src = node.attrs.get('src')
                if iframe_src and iframe_src in iframe_src_to_frame_id:
                    dom_node.child_frame_id = iframe_src_to_frame_id[iframe_src]

            for child in node.children:
                child_id = _build_tree(child)
                if child_id is not None:
                    dom_node.children_ids.append(child_id)

            parsed_frames[frame.frame_id][element_id] = dom_node
            return element_id

        if soup.body:
            _build_tree(soup.body)

        for nav_id, metadata_dict in frame.metadata.items():
            bs4_element = nav_id_to_bs4_element.get(nav_id)
            if not bs4_element:
                continue

            target_node = next((n for n in parsed_frames[frame.frame_id].values(
            ) if n.attributes.get('data-navigator-id') == nav_id), None)

            if target_node:
                metadata_obj = DOMMetadata(**metadata_dict) if not isinstance(metadata_dict, DOMMetadata) else metadata_dict
                target_node.navigator_id = nav_id
                target_node.metadata = metadata_obj
                target_node.is_visible_and_on_top = True
                target_node.is_interactive = is_element_interactive(
                    bs4_element, metadata_obj)

    logger.debug("Starting ancestor suppression pass...")
    all_nodes = {node.navigator_id: node for frame in parsed_frames.values()
                 for node in frame.values() if node.navigator_id}

    for node in all_nodes.values():
        if node.is_interactive and node.metadata and node.metadata.interactive_ancestor_id:
            ancestor_node = all_nodes.get(
                node.metadata.interactive_ancestor_id)
            if ancestor_node and ancestor_node.is_interactive:
                node.is_interactive = False
                logger.debug(
                    f"Suppressed interactivity for node {node.navigator_id} due to interactive ancestor {ancestor_node.navigator_id}")

    logger.info("DOM parsing and all processing complete.")

    optimized_dom_data, url_mapping = dom_optimizer(parsed_frames)

    return parsed_frames, textual_content, optimized_dom_data, url_mapping


def parse_and_optimize_dom(
    dom_data: FullDOMData,
    detail_level: str = 'detailed'
) -> Tuple[str, Dict[str, str], Dict[int, Dict[int, DOMTagNode]]]:
    """
    The single, definitive function to parse, enrich, and optimize the DOM for the LLM.
    """
    logger.info(
        f"Starting DOM processing for URL: {dom_data.url} with {len(dom_data.frames)} frames.")

    parsed_frames: Dict[int, Dict[int, DOMTagNode]] = {
        frame.frame_id: {} for frame in dom_data.frames}
    global_element_id_counter = 0
    iframe_src_to_frame_id: Dict[str, int] = {
        frame.url: frame.frame_id for frame in dom_data.frames if frame.frame_id != 0
    }

    for frame in dom_data.frames:
        soup = BeautifulSoup(frame.html, 'html.parser')

        def _build_tree(node: Tag) -> int | None:
            nonlocal global_element_id_counter
            if not isinstance(node, Tag):
                return None

            element_id = global_element_id_counter
            global_element_id_counter += 1

            full_text = node.get_text(separator=' ', strip=True)

            dom_node = DOMTagNode(
                element_id=element_id,
                tag=node.name,
                attributes=node.attrs,
                xpath=get_xpath_for_element(node),
                text_content=full_text if full_text else None,
                is_likely_captcha=is_likely_captcha(node)
            )

            if node.name.lower() == 'iframe':
                iframe_src = node.attrs.get('src')
                if iframe_src and iframe_src in iframe_src_to_frame_id:
                    dom_node.child_frame_id = iframe_src_to_frame_id[iframe_src]

            for child in node.children:
                child_id = _build_tree(child)
                if child_id is not None:
                    dom_node.children_ids.append(child_id)

            parsed_frames[frame.frame_id][element_id] = dom_node
            return element_id

        if soup.body:
            _build_tree(soup.body)

    for frame in dom_data.frames:
        for nav_id, metadata_dict in frame.metadata.items():
            target_node = next((n for n in parsed_frames[frame.frame_id].values(
            ) if n.attributes.get('data-navigator-id') == nav_id), None)
            if target_node:
                target_node.navigator_id = nav_id
                target_node.metadata = DOMMetadata(**metadata_dict) if not isinstance(metadata_dict, DOMMetadata) else metadata_dict
                target_node.is_visible_and_on_top = True
                target_node.is_interactive = True

    all_nodes_with_nav_id = {node.navigator_id: node for frame in parsed_frames.values(
    ) for node in frame.values() if node.navigator_id}
    for node in all_nodes_with_nav_id.values():
        if node.is_interactive and node.metadata and node.metadata.interactive_ancestor_id:
            ancestor_node = all_nodes_with_nav_id.get(
                node.metadata.interactive_ancestor_id)
            if ancestor_node and ancestor_node.is_interactive:
                if not is_distinct_interaction(node):
                    node.is_interactive = False

    optimized_string, element_data, url_map = advanced_dom_optimizer(
        parsed_frames, detail_level)


    logger.info(optimized_string)

    logger.info("DOM processing and optimization complete.")
    return optimized_string, url_map, parsed_frames


