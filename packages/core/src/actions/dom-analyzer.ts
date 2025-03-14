import { DOMElementNode, DOMHashMap } from "../types";
import { isElementVisible, isInteractiveElement, isTextNodeVisible, isTopElement } from "../utils/filters";

const logger = {
    debug: (message: string, ...data: any[]) => console.debug(`[DOM-Analyzer] ${message}`, ...data),
    error: (message: string, error?: any) => console.error(`[DOM-Analyzer] ${message}`, error)
};

const API_SERVER_URL = "http://localhost:8000";

export async function parseDOMonServer(html: string): Promise<DOMHashMap> {
    const response = await fetch(`${API_SERVER_URL}/dom/parse`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"  // Add this header
        },
        body: JSON.stringify({
            html: html,
        }),
    });
    return response.json();
}

export function parseDOM(document: Document): DOMHashMap {
    try {
        logger.debug("Starting DOM parsing");
        const domHashMap: DOMHashMap = {};
        let currentId = 0;

        // Function to process each node in a depth-first manner
        function processNode(node: Node, parentId: number | null = null): number {
            try {
                if (!node) {
                    logger.debug("Skipping null node");
                    return -1;
                }

                const nodeId = currentId++;
                logger.debug(`Processing node ${nodeId}, type: ${node.nodeType}`);

                // Skip if it's not an element or text node
                if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
                    logger.debug(`Skipping node with type ${node.nodeType}`);
                    return -1; // Invalid ID to indicate skipped node
                }

                // Handle text nodes
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent?.trim() || "";
                    // Skip empty text nodes
                    if (!text) {
                        logger.debug("Skipping empty text node");
                        return -1;
                    }

                    const isVisible = isTextNodeVisible(node as Text);
                    logger.debug(`Text node: "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}", visible: ${isVisible}`);

                    domHashMap[nodeId] = {
                        type: "TEXT_NODE",
                        text: text,
                        isVisible: isVisible,
                    };

                    return nodeId;
                }

                // Handle element nodes
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const element = node as Element;
                    const tagName = element.tagName.toLowerCase();
                    logger.debug(`Element node: <${tagName}>`);

                    // Extract attributes properly
                    const attributes: Record<string, string> = {};
                    try {
                        if (element.attributes) {
                            for (let i = 0; i < element.attributes.length; i++) {
                                const attr = element.attributes[i];
                                attributes[attr.name] = attr.value;
                            }
                        }
                        logger.debug(`Extracted ${Object.keys(attributes).length} attributes`);
                    } catch (attrError) {
                        logger.error("Error extracting attributes", attrError);
                    }

                    // Get XPath with error handling
                    let xpath = "";
                    try {
                        xpath = getXPathForElement(element);
                        logger.debug(`Generated XPath: ${xpath}`);
                    } catch (xpathError) {
                        logger.error("Error generating XPath", xpathError);
                        xpath = `/${tagName}`; // Fallback
                    }

                    // Check element properties
                    const isInteractive = isInteractiveElement(element);
                    const isVisible = isElementVisible(element);
                    const isTop = isTopElement(element);

                    logger.debug(`Element properties - interactive: ${isInteractive}, visible: ${isVisible}, top: ${isTop}`);

                    // Create the element node
                    const elementNode: DOMElementNode = {
                        tagName: tagName,
                        attributes: attributes,
                        xpath: xpath,
                        children: [],
                        isInteractive: isInteractive,
                        isVisible: isVisible,
                        isTopElement: isTop,
                    };

                    domHashMap[nodeId] = elementNode;

                    // Process children
                    try {
                        logger.debug(`Processing ${node.childNodes.length} children for ${tagName}`);
                        for (let i = 0; i < node.childNodes.length; i++) {
                            const childId = processNode(node.childNodes[i], nodeId);
                            if (childId !== -1) {
                                elementNode.children.push(childId);
                            }
                        }
                    } catch (childError) {
                        logger.error(`Error processing children of ${tagName}`, childError);
                    }

                    return nodeId;
                }

                return -1; // Should never reach here
            } catch (processError) {
                logger.error("Error processing node", processError);
                return -1;
            }
        }

        // Helper function to generate a proper XPath
        function getXPathForElement(element: Element): string {
            try {
                const parts: string[] = [];
                let current: Element | null = element;

                while (current && current.nodeType === Node.ELEMENT_NODE) {
                    let part = current.tagName.toLowerCase();

                    // Add index if there are siblings with the same tag
                    if (current.parentElement) {
                        const siblings = Array.from(current.parentElement.children);
                        const sameTagSiblings = siblings.filter(sibling =>
                            sibling.tagName.toLowerCase() === part);

                        if (sameTagSiblings.length > 1) {
                            const index = sameTagSiblings.indexOf(current) + 1;
                            part += `[${index}]`;
                        }
                    }

                    parts.unshift(part);
                    current = current.parentElement;
                }

                return `/${parts.join('/')}`;
            } catch (xpathError) {
                logger.error("Error generating XPath", xpathError);
                return "/unknown";
            }
        }

        // Start processing from the body element
        let rootId = -1;
        if (document?.body) {
            logger.debug("Starting processing from document body");
            rootId = processNode(document.body);
        } else {
            logger.error("Document body not available");
        }

        logger.debug(`DOM parsing complete, created ${Object.keys(domHashMap).length} entries`);
        return domHashMap;
    } catch (error) {
        logger.error("Fatal error in parseDOM", error);
        return {}; // Return empty object instead of failing completely
    }
}