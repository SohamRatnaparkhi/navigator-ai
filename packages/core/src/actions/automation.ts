import { Action } from '../types';

export class AutomationHandler {
    private async findElement(action: Action, retryCount = 0): Promise<Element | null> {
        console.log(`Attempting to find element (attempt ${retryCount + 1})`, action);

        let element: Element | null = null;

        if (action.element_id) {
            element = document.getElementById(action.element_id);
            console.log(`Searching by ID "${action.element_id}": ${element ? 'Found' : 'Not found'}`);
        }

        if (!element && action.selector) {
            try {
                const escapedSelector = this.escapeSelector(action.selector);
                element = document.querySelector(escapedSelector);
                console.log(`Searching by selector "${escapedSelector}": ${element ? 'Found' : 'Not found'}`);

                if (!element) {
                    const genericSelector = action.selector.replace(/#[^.#\s[\]]+/g, '*');
                    if (genericSelector !== action.selector) {
                        const escapedGenericSelector = this.escapeSelector(genericSelector);
                        console.log(`Trying generic selector: ${escapedGenericSelector}`);
                        element = document.querySelector(escapedGenericSelector);
                    }
                }
            } catch (error) {
                console.error(`Error with selector "${action.selector}":`, error);
            }
        }

        if (!element && action.xpath_ref) {
            try {
                const result = document.evaluate(
                    action.xpath_ref,
                    document,
                    null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE,
                    null
                );
                element = result.singleNodeValue as Element;
                console.log(`Searching by XPath "${action.xpath_ref}": ${element ? 'Found' : 'Not found'}`);
            } catch (error) {
                console.error(`Error evaluating XPath "${action.xpath_ref}":`, error);
            }
        }

        if (!element && (action.text || action.type === 'click')) {
            const textToFind = action.text ||
                (action.selector?.includes('repositories') ? 'Repositories' : '') ||
                (action.element_id?.includes('repositories') ? 'Repositories' : '');

            if (textToFind) {
                console.log(`Trying to find element by text: "${textToFind}"`);

                const elementsWithText = Array.from(
                    document.querySelectorAll('a, button, [role="tab"], [role="button"], input[type="submit"], input[type="button"], .btn, nav li, [aria-label*="' + textToFind + '"], [title*="' + textToFind + '"]')
                ).filter(el => {
                    const content = el.textContent?.trim().toLowerCase() || '';
                    if (content.includes(textToFind.toLowerCase())) return true;

                    for (const child of Array.from(el.children)) {
                        if (child.textContent?.trim().toLowerCase().includes(textToFind.toLowerCase())) {
                            return true;
                        }
                    }

                    const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                    const title = el.getAttribute('title')?.toLowerCase() || '';
                    const alt = el.getAttribute('alt')?.toLowerCase() || '';
                    const placeholder = el.getAttribute('placeholder')?.toLowerCase() || '';

                    return ariaLabel.includes(textToFind.toLowerCase()) ||
                        title.includes(textToFind.toLowerCase()) ||
                        alt.includes(textToFind.toLowerCase()) ||
                        placeholder.includes(textToFind.toLowerCase());
                });

                if (elementsWithText.length > 0) {
                    const visibleElements = elementsWithText.filter(el => this.isElementVisible(el as Element));
                    element = visibleElements.length > 0 ? visibleElements[0] as Element : elementsWithText[0] as Element;
                    console.log(`Found element by text content:`, element);
                }
            }
        }

        if (!element) {
            const iframes = document.querySelectorAll('iframe');
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const iframe = iframes[i];
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

                    if (iframeDoc) {
                        if (action.element_id) {
                            element = iframeDoc.getElementById(action.element_id);
                            if (element) break;
                        }

                        if (action.selector) {
                            try {
                                element = iframeDoc.querySelector(this.escapeSelector(action.selector));
                                if (element) break;
                            } catch (e) {
                                console.log(`Error with selector in iframe:`, e);
                            }
                        }
                    }
                } catch (error) {
                    console.log(`Cannot access iframe content due to security restrictions`);
                }
            }
        }

        if (element && !this.isElementVisible(element)) {
            console.log('Element found but not visible, looking for alternatives');

            if (action.type === 'click') {
                const parent = element.parentElement;
                if (parent) {
                    const nearbyElements = Array.from(parent.querySelectorAll('a, button, [role="button"], input[type="submit"]'))
                        .filter(el => this.isElementVisible(el as Element));

                    if (nearbyElements.length > 0) {
                        element = nearbyElements[0] as Element;
                        console.log('Found nearby visible interactive element instead:', element);
                    }
                }
            }
        }

        if (!element && retryCount < 3) {
            console.log(`Element not found, waiting and retrying (attempt ${retryCount + 1}/3)`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Increasing wait time
            return this.findElement(action, retryCount + 1);
        }

        return element;
    }

    private isElementVisible(element: Element): boolean {
    if (!element || !(element instanceof HTMLElement)) return false;
    
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    
    // Check if element has zero size
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }
    
    // Check if element is within viewport
    const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
    
    // Element might still be valid even if not in viewport, but we prioritize visible elements
    return true;
}

    private escapeSelector(selector: string): string {
        // If the selector contains potential special characters that need escaping
        if (selector.includes(':') || selector.includes('.') || selector.includes('#')) {
            try {
                // CSS.escape is the proper way but might not be available in all environments
                if (typeof CSS !== 'undefined' && CSS.escape) {
                    // Split by spaces and escape each part separately to handle complex selectors
                    return selector.split(/\s+/)
                        .map(part => {
                            // Handle ID and class selectors separately
                            if (part.startsWith('#') || part.startsWith('.')) {
                                const prefix = part.charAt(0);
                                const value = part.substring(1);
                                return prefix + CSS.escape(value);
                            }
                            return part;
                        })
                        .join(' ');
                } else {
                    // Fallback: manually escape special characters
                    return selector.replace(/(:)/g, '\\$1');
                }
            } catch (e) {
                console.error('Error escaping selector:', e);
                return selector; // Return original if escaping fails
            }
        }
        return selector;
    }


    private async scrollToElement(element: Element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Wait for scroll to complete
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    private async simulateHumanClick(element: Element) {
        const delay = Math.random() * 200 + 100; // Random delay between 100-300ms
        await new Promise(resolve => setTimeout(resolve, delay));

        const events = ['mousedown', 'mouseup', 'click'];
        for (const eventType of events) {
            const event = new MouseEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window
            });
            element.dispatchEvent(event);
        }
    }

    private async simulateHumanInput(element: HTMLInputElement, text: string) {
        // Focus the element
        element.focus();

        // Clear existing value
        element.value = '';
        element.dispatchEvent(new Event('input', { bubbles: true }));

        // Type each character with random delays
        for (const char of text) {
            const delay = Math.random() * 100 + 50; // Random delay between 50-150ms
            await new Promise(resolve => setTimeout(resolve, delay));
            
            element.value += char;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Trigger change event after typing
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    async executeAction(action: Action, retryCount = 0): Promise<boolean> {
        try {
            console.log('Executing action:', action.type, action);

            const element = await this.findElement(action);
            if (!element && action.type !== 'navigate') {
                console.error('Element not found for action:', action);
                
                if (retryCount < 2) {
                    console.log(`Action failed, waiting and retrying (attempt ${retryCount + 1}/2)`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait longer between retries
                    return this.executeAction(action, retryCount + 1);
                }
                
                return false;
            }
            switch (action.type) {
                case 'click':
                    if (!element) return false;
                    await this.scrollToElement(element);
                    await this.simulateHumanClick(element);
                    
                    // Add a longer wait after clicking to ensure page updates
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    break;

                case 'input':
                    if (!element || !action.text) return false;
                    await this.scrollToElement(element);
                    await this.simulateHumanInput(element as HTMLInputElement, action.text);
                    break;

                case 'scroll':
                    if (!element) return false;
                    await this.scrollToElement(element);
                    break;

                case 'navigate':
                    if (!action.url) return false;
                    console.log(`Navigating to: ${action.url}`);
                    window.location.href = action.url;
                    // Wait longer for navigation to complete
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    break;

                default:
                    console.error('Unknown action type:', action.type);
                    return false;
            }

            console.log(`Action ${action.type} executed successfully`);
            return true;
        } catch (error) {
            console.error('Error executing action:', error);
            
            // If we haven't exceeded retries, try again
            if (retryCount < 2) {
                console.log(`Action failed with error, waiting and retrying (attempt ${retryCount + 1}/2)`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                return this.executeAction(action, retryCount + 1);
            }
            
            return false;
        }
    }

    async executeActions(actions: Action[]): Promise<boolean[]> {
        const results: boolean[] = [];
        
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            console.log(`Executing action ${i+1} of ${actions.length}:`, action.type);
            
            try {
                const success = await this.executeAction(action);
                results.push(success);
                
                if (!success) {
                    console.error(`Action ${i+1} (${action.type}) failed. Continuing with next action.`);
                } else {
                    console.log(`Action ${i+1} (${action.type}) completed successfully`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Unexpected error in action ${i+1} (${action.type}):`, error);
                results.push(false);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        console.log(`Executed ${actions.length} actions with results:`, results);
        return results;
    }
} 