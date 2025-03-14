import { DOMElementNode, DOMHashMap, DOMNode, parseDOMonServer, Action, AutomationHandler } from '@navigator-ai/core';
import { FrontendDOMState, Message, ProcessingStatus } from './types';

console.log('Content script loaded');

let sidebarContainer: HTMLElement | null = null;

function createSidebarContainer() {
    console.log('Creating sidebar container');

    let container = document.getElementById('navigator-ai-sidebar');
    if (container) {
        console.log('Sidebar container already exists');
        return container;
    }

    container = document.createElement('div');
    container.id = 'navigator-ai-sidebar';

    // Set essential properties
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.right = '0';
    container.style.width = '0'; // Start with zero width
    container.style.height = '100%';
    container.style.zIndex = '9999999';
    container.style.transition = 'width 0.3s ease';
    container.style.overflow = 'hidden';

    const shadow = container.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        :host {
            color-scheme: light dark;
        }
        
        iframe {
            width: 100%;
            height: 100%;
            border: none;
            background-color: transparent !important;
        }
        
        .sidebar-open {
            width: 384px !important; /* 96 * 4 = 384px for w-96 in Tailwind */
        }
        
        .sidebar-closed {
            width: 0 !important;
        }
    `;

    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('popup.html');
    iframe.style.backgroundColor = 'transparent';
    iframe.style.opacity = '0.98';
    iframe.allow = 'autoplay';

    shadow.appendChild(style);
    shadow.appendChild(iframe);

    document.body.appendChild(container);

    sidebarContainer = container;

    return container;
}

function updateSidebarState(isOpen: boolean) {
    console.log('Updating sidebar state:', isOpen);

    if (!sidebarContainer) {
        sidebarContainer = createSidebarContainer();
    }

    if (isOpen) {
        sidebarContainer.style.width = '384px'; // w-96 in Tailwind
        sidebarContainer.classList.add('sidebar-open');
        sidebarContainer.classList.remove('sidebar-closed');
    } else {
        sidebarContainer.style.width = '0';
        sidebarContainer.classList.add('sidebar-closed');
        sidebarContainer.classList.remove('sidebar-open');
    }
}

function toggleSidebar() {
    console.log('Toggling sidebar');

    if (!sidebarContainer) {
        sidebarContainer = createSidebarContainer();
    }

    const isCurrentlyOpen = sidebarContainer.classList.contains('sidebar-open');
    updateSidebarState(!isCurrentlyOpen);

    return !isCurrentlyOpen;
}


async function captureIframeContents(originalHtml: string): Promise<string> {
    try {
        console.log('Capturing iframe contents...');
        
        const iframes = document.querySelectorAll('iframe');
        
        if (iframes.length === 0) {
            console.log('No iframes found on the page');
            return originalHtml;
        }
        
        console.log(`Found ${iframes.length} iframes on the page`);
        let processedHtml = originalHtml;
        
        const iframeContents: string[] = [];
        
        for (let i = 0; i < iframes.length; i++) {
            try {
                const iframe = iframes[i];
                
                if (!iframe.contentDocument || !iframe.contentWindow || 
                    iframe.src.startsWith('chrome-extension://')) {
                    console.log(`Skipping iframe ${i} - cannot access content or is extension iframe`);
                    continue;
                }
                
                let iframeContent: string;
                try {
                    const iframeDoc = iframe.contentDocument;
                    
                    const baseContent = iframeDoc.documentElement.outerHTML;
                    
                    const nestedIframes = iframeDoc.querySelectorAll('iframe');
                    if (nestedIframes.length > 0) {
                        console.log(`Found ${nestedIframes.length} nested iframes in iframe ${i}`);
                        iframeContent = await captureIframeContents(baseContent);
                    } else {
                        iframeContent = baseContent;
                    }
                } catch (err) {
                    console.log(`Cannot access iframe ${i} content due to cross-origin restrictions:`, err);
                    continue;
                }
                
                const iframeId = `iframe-content-${i}`;
                
                const iframeAttrs: string[] = [];
                if (iframe.id) iframeAttrs.push(`id="${iframe.id}"`);
                if (iframe.className) iframeAttrs.push(`class="${iframe.className}"`);
                if (iframe.src) iframeAttrs.push(`src="${iframe.src}"`);
                if (iframe.name) iframeAttrs.push(`name="${iframe.name}"`);
                
                const iframeXPath = getXPathForElement(iframe);
                if (iframeXPath) iframeAttrs.push(`xpath="${iframeXPath}"`);
                
                const iframeDataTag = `<navigator-iframe-data ${iframeAttrs.join(' ')} data-iframe-id="${iframeId}">\n${iframeContent}\n</navigator-iframe-data>`;
                iframeContents.push(iframeDataTag);
                
                try {
                    const domPosition = findIframePositionInHTML(processedHtml, iframe);
                    if (domPosition > -1) {
                        const beforeIframe = processedHtml.substring(0, domPosition);
                        const afterIframe = processedHtml.substring(domPosition);
                        
                        const newAfterIframe = afterIframe.replace(
                            /(<iframe\s)/i, 
                            `$1data-navigator-iframe-id="${iframeId}" `
                        );
                        
                        processedHtml = beforeIframe + newAfterIframe;
                    }
                } catch (markError) {
                    console.error('Error marking iframe in HTML:', markError);
                }
            } catch (error) {
                console.error(`Error processing iframe ${i}:`, error);
            }
        }
        
        if (iframeContents.length > 0) {
            processedHtml += `\n<!-- Navigator AI Iframe Contents -->\n<navigator-iframes>\n${iframeContents.join('\n')}\n</navigator-iframes>`;
            console.log(`Added content from ${iframeContents.length} iframes to the DOM`);
        }
        
        return processedHtml;
    } catch (error) {
        console.error('Error capturing iframe contents:', error);
        return originalHtml;
    }
}

function getXPathForElement(element: Element): string | null {
    try {
        if (element === document.documentElement) {
            return '/html';
        }
        
        if (element === document.body) {
            return '/html/body';
        }
        
        let xpath = '';
        let current = element;
        
        while (current && current !== document.documentElement) {
            let nodeName = current.nodeName.toLowerCase();
            let position = 1;
            let sibling = current.previousSibling;
            
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && 
                    sibling.nodeName.toLowerCase() === nodeName) {
                    position++;
                }
                sibling = sibling.previousSibling;
            }
            
            xpath = `/${nodeName}[${position}]${xpath}`;
            
            if (current.parentNode) {
                current = current.parentNode as Element;
            } else {
                break;
            }
        }
        
        return `/html${xpath}`;
    } catch (error) {
        console.error('Error generating XPath:', error);
        return null;
    }
}

/**
 * Helper function to find the approximate position of an iframe in the HTML string
 */
function findIframePositionInHTML(html: string, iframe: HTMLIFrameElement): number {
    try {
        const attributes: [string, string][] = [];
        
        if (iframe.id) attributes.push(['id', iframe.id]);
        if (iframe.className) attributes.push(['class', iframe.className]);
        if (iframe.src) attributes.push(['src', iframe.src]);
        if (iframe.name) attributes.push(['name', iframe.name]);
        
        for (const [attr, value] of attributes) {
            const searchStr = `<iframe ${attr}="${value}"`;
            const altSearchStr = `<iframe ${attr}='${value}'`;
            
            let pos = html.indexOf(searchStr);
            if (pos > -1) return pos;
            
            pos = html.indexOf(altSearchStr);
            if (pos > -1) return pos;
        }
        
        return html.indexOf('<iframe');
    } catch (error) {
        console.error('Error finding iframe position:', error);
        return -1;
    }
}

async function processDOM(task_id: string): Promise<FrontendDOMState> {
    try {
        console.log('Processing DOM for task:', task_id);

        const htmlContent = document.documentElement.outerHTML;
        
        const processedHtml = await captureIframeContents(htmlContent);

        console.log('Sending HTML with iframe contents to server for parsing...');
        const domStructure = await parseDOMonServer(processedHtml);
        console.log('Received parsed DOM structure from server');

        const domData: FrontendDOMState = {
            url: window.location.href,
            html: processedHtml,
            title: document.title,
            timestamp: new Date().toISOString(),
            structure: domStructure
        };

        console.log('Highlighting interactive elements');
        highlightInteractiveElements(domStructure);

        console.log('Sending DOM update to background, structure size:',
            JSON.stringify(domData.structure).length, 'bytes');

        // Send data to background script and wait for complete response including any actions
        return new Promise<FrontendDOMState>((resolve, reject) => {
            chrome.runtime.sendMessage({
                type: 'dom_update',
                task_id,
                dom_data: domData,
                result: []
            }, async response => {
                console.log('Background script response from DOM update:', response);
                
                if (response && response.data) {
                    // Check if there are actions to execute and wait for them to complete
                    if (response.data.result?.actions && response.data.result.actions.length > 0) {
                        console.log('Waiting for actions to complete...');
                        try {
                            // Wait for actions from the update response to complete
                            // before resolving the processDOM promise
                            const actionResults = await handleAutomationActions(response.data.result.actions);
                            console.log('Action execution results:', actionResults);
                            
                            // Only resolve after actions are complete
                            resolve(domData);
                        } catch (actionError) {
                            console.error('Error executing actions:', actionError);
                            reject(new Error('Failed to execute actions: ' + (actionError as Error).message));
                        }
                    } else {
                        // No actions to execute, resolve immediately
                        resolve(domData);
                    }
                } else if (response && response.success) {
                    resolve(domData);
                } else {
                    reject(new Error('Failed to update DOM: ' + (response?.error || 'Unknown error')));
                }
            });
        });
    } catch (error) {
        console.error('Error processing DOM:', error);
        throw error;
    }
}

function highlightInteractiveElements(domStructure: DOMHashMap) {
    // Clear previous highlights first
    clearAllHighlights();

    const interactiveElements = Object.values(domStructure).filter((node) => {
        if (!node.isVisible) {
            return false;
        }
        if (!('type' in node)) {
            const element = node as DOMElementNode;
            return element.isInteractive;
        }
        return false;
    });

    // highlight interactive elements by adding style and color to the dom by accessing element using xpath
    interactiveElements.forEach((element: DOMNode, index: number) => {
        const xpath = (element as DOMElementNode).xpath;
        try {
            // First try to get the element using our iframe-aware function
            let highlightedElement = getElementByXPathIncludingIframes(xpath);
            
            // If that fails, try the standard approach
            if (!highlightedElement) {
                highlightedElement = document.evaluate(
                    xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                ).singleNodeValue as HTMLElement;
            }
            
            if (highlightedElement && highlightedElement instanceof HTMLElement) {
                // Check if element is in an iframe
                let parentDocument = document;
                let elementWindow = window;
                let isInIframe = false;
                
                // Find which document this element belongs to
                try {
                    const iframes = document.querySelectorAll('iframe');
                    for (let i = 0; i < iframes.length; i++) {
                        const iframe = iframes[i];
                        if (iframe.contentDocument && iframe.contentDocument.contains(highlightedElement)) {
                            parentDocument = iframe.contentDocument;
                            elementWindow = iframe.contentWindow!;
                            isInIframe = true;
                            break;
                        }
                    }
                } catch (frameError) {
                    console.error('Error finding parent frame:', frameError);
                }
                
                // Apply highlighting appropriately based on whether it's in an iframe
                if (isInIframe) {
                    // For iframe elements, we need to inject a style and apply the highlight via class
                    try {
                        // Create a style element in the iframe if it doesn't exist
                        let styleEl = parentDocument.getElementById('navigator-ai-highlight-style');
                        if (!styleEl) {
                            styleEl = parentDocument.createElement('style');
                            styleEl.id = 'navigator-ai-highlight-style';
                            parentDocument.head.appendChild(styleEl);
                        }
                        
                        // Add the highlight class style
                        const color = colors[index % colors.length];
                        styleEl.textContent += `
                            .navigator-ai-highlight-${index} {
                                outline: 2px solid ${color} !important;
                                outline-offset: 2px !important;
                            }
                        `;
                        
                        // Apply the class
                        highlightedElement.classList.add(`navigator-ai-highlight-${index}`);
                        highlightedElement.classList.add('navigator-ai-highlight');
                    } catch (styleError) {
                        console.error('Error applying iframe styles:', styleError);
                    }
                } else {
                    // For regular document elements, apply style directly
                    highlightedElement.style.outline = `2px solid ${colors[index % colors.length]}`;
                    highlightedElement.style.outlineOffset = '2px';
                    highlightedElement.classList.add('navigator-ai-highlight');
                }
            }
        } catch (error) {
            console.error('Error highlighting element:', error);
        }
    });
}

// Function to clear all highlights
function clearAllHighlights() {
    // Clear highlights in the main document
    const highlightedElements = document.querySelectorAll('.navigator-ai-highlight');
    highlightedElements.forEach((el) => {
        if (el instanceof HTMLElement) {
            el.style.outline = '';
            el.style.outlineOffset = '';
            // Remove all navigator-ai-highlight classes
            el.className = el.className
                .split(' ')
                .filter(c => !c.startsWith('navigator-ai-highlight'))
                .join(' ');
        }
    });
    
    // Also clear highlights in all accessible iframes
    try {
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            
            // Skip iframes that can't be accessed
            if (!iframe.contentDocument || iframe.src.startsWith('chrome-extension://')) {
                continue;
            }
            
            try {
                // Clear highlighted elements in this iframe
                const iframeHighlights = iframe.contentDocument.querySelectorAll('.navigator-ai-highlight');
                iframeHighlights.forEach((el) => {
                    if (el instanceof HTMLElement) {
                        el.style.outline = '';
                        el.style.outlineOffset = '';
                        // Remove all navigator-ai-highlight classes
                        el.className = el.className
                            .split(' ')
                            .filter(c => !c.startsWith('navigator-ai-highlight'))
                            .join(' ');
                    }
                });
                
                // Remove the highlight style element if it exists
                const styleEl = iframe.contentDocument.getElementById('navigator-ai-highlight-style');
                if (styleEl) {
                    styleEl.parentNode?.removeChild(styleEl);
                }
            } catch (iframeError) {
                console.error(`Error clearing highlights in iframe ${i}:`, iframeError);
            }
        }
    } catch (error) {
        console.error('Error clearing highlights in iframes:', error);
    }
}

// Initialize automation handler
const automationHandler = new AutomationHandler();

// New function to process DOM sequentially
async function sequentialDOMProcessing(task_id: string, maxIterations = 10) {
    // Always start with 0 iterations when workflow starts
    let iteration = 0;
    let isDone = false;
    
    console.log('Starting sequential DOM processing for task:', task_id);
    
    // Notify background script to reset iteration counter
    await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({
            type: 'resetIterations',
            task_id
        }, () => {
            resolve();
        });
    });
    
    while (!isDone && iteration < maxIterations) {
        console.log(`Starting iteration ${iteration + 1} of DOM processing`);
        
        try {
            // Step 1: Parse and update DOM, which now also waits for any actions to complete
            // This ensures the entire process is sequential
            await processDOM(task_id);
            
            // Increment iteration counter after processing is complete
            iteration++;
            
            // Step 2: Check if processing is done
            // After actions have completed, check if the task is marked as done
            isDone = await checkIfProcessingDone(task_id);
            
            console.log(`Iteration ${iteration} complete. isDone:`, isDone);
            
            // Add a small delay between iterations to avoid overwhelming the system
            if (!isDone && iteration < maxIterations) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } catch (error) {
            console.error(`Error in iteration ${iteration + 1}:`, error);
            break;
        }
    }
    
    console.log(`Sequential DOM processing complete after ${iteration} iterations`);
    return { success: true, iterations: iteration, isDone };
}

// Function to check if processing is done
function checkIfProcessingDone(task_id: string): Promise<boolean> {
    return new Promise((resolve) => {
        // First check local storage directly for the most up-to-date state
        chrome.storage.local.get(['activeSession', 'taskState', 'lastUpdateResponse'], (result) => {
            // Check multiple sources for workflow completion
            
            // 1. Check active session status
            const sessionDone = result.activeSession?.status === 'completed';
            
            // 2. Check if last update response had is_done flag
            const lastUpdateDone = result.lastUpdateResponse?.data?.result?.is_done === true;
            
            // 3. Check task state processing status
            const processingDone = result.taskState?.processingStatus === 'completed';
            
            console.log('Completion check:', { 
                sessionDone, 
                lastUpdateDone, 
                processingDone
            });
            
            // If ANY of these indicate completion, consider the workflow done
            const isDone = sessionDone || lastUpdateDone || processingDone;
            
            if (isDone) {
                console.log('Workflow completion detected, marking as done');
                resolve(true);
                return;
            }
            
            // If not found in storage, try message-based check as backup
            chrome.runtime.sendMessage({
                type: 'check_processing_status',
                task_id
            }, response => {
                console.log('Processing status check response:', response);
                
                // Check if the response has the isDone property
                if (response && typeof response.isDone === 'boolean') {
                    resolve(response.isDone);
                } else {
                    // Default to false if no completion signals found
                    resolve(false);
                }
            });
        });
    });
}

// Helper function to wait for a specific processing status
async function waitForProcessingStatus(task_id: string, targetStatus: ProcessingStatus, timeoutMs = 60000): Promise<boolean> {
    const startTime = Date.now();
    let statusCheckCount = 0;
    
    return new Promise<boolean>((resolve) => {
        // Set a timeout to avoid hanging forever
        const timeoutId = setTimeout(() => {
            console.warn(`Waiting for status ${targetStatus} timed out after ${timeoutMs}ms`);
            // Force status to completed if we're waiting for completed status and timing out
            if (targetStatus === 'completed') {
                console.warn('Forcing status to completed to avoid being stuck');
                chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'completed'
                }).catch(err => console.error('Error forcing status update:', err));
            }
            resolve(false);
        }, timeoutMs);
        
        // Check status periodically
        const checkStatus = async () => {
            statusCheckCount++;
            const result = await chrome.storage.local.get(['taskState']);
            const currentStatus = result.taskState?.processingStatus;
            
            console.log(`Current processing status: ${currentStatus}, waiting for: ${targetStatus} (check #${statusCheckCount})`);
            
            if (currentStatus === targetStatus) {
                clearTimeout(timeoutId);
                resolve(true);
                return;
            }
            
            // If error status, stop waiting
            if (currentStatus === 'error') {
                clearTimeout(timeoutId);
                console.error('Processing status shows error, stopping wait');
                resolve(false);
                return;
            }
            
            // If waiting for completion and stuck in executing_actions for too long, force completion
            if (targetStatus === 'completed' && currentStatus === 'executing_actions' && statusCheckCount > 10) {
                clearTimeout(timeoutId);
                console.warn('Execution taking too long, forcing completion status');
                await chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'completed'
                }).catch(err => console.error('Error forcing status update:', err));
                resolve(true);
                return;
            }
            
            // If we've waited too long, stop
            if (Date.now() - startTime > timeoutMs - 5000) { // Leave 5s buffer for timeout
                clearTimeout(timeoutId);
                console.warn(`Waiting for status ${targetStatus} timed out after ${Date.now() - startTime}ms`);
                resolve(false);
                return;
            }
            
            // Check again after a delay
            setTimeout(checkStatus, 500);
        };
        
        // Start checking
        checkStatus();
    });
}

// Helper to get the latest server update from storage
async function getLatestUpdateResult(task_id: string): Promise<any> {
    const result = await chrome.storage.local.get(['currentDOMUpdate', 'lastUpdateResponse']);
    
    if (result.currentDOMUpdate?.task_id === task_id && result.currentDOMUpdate?.status === 'completed') {
        return {
            success: true,
            data: result.currentDOMUpdate.result
        };
    } else if (result.lastUpdateResponse?.task_id === task_id) {
        return {
            success: true,
            data: result.lastUpdateResponse.data
        };
    }
    
    return {
        success: false,
        error: 'No update result found'
    };
}

async function singleDOMProcessIteration(task_id: string): Promise<{ 
    success: boolean; 
    error?: string;
    isDone?: boolean;
}> {
    try {
        console.log('Starting single DOM process iteration for task:', task_id);
        
        const currentUrl = window.location.href;
        const domainCheckResult = await checkDomainChange(currentUrl, task_id);
        
        if (domainCheckResult.domainChanged) {
            console.log('Domain has changed, terminating workflow');
            return { 
                success: false, 
                error: 'Domain changed, workflow terminated',
                isDone: true 
            };
        }
        
        // Capture main document HTML
        const htmlContent = document.documentElement.outerHTML;
        
        // Add a marker for iframe content that we'll replace with actual iframe content
        const processedHtml = await captureIframeContents(htmlContent);
        
        console.log('Sending HTML with iframe contents to server for parsing...');
        
        const domStructure = await parseDOMonServer(processedHtml);
        console.log('Received parsed DOM structure from server');
        
        const domData: FrontendDOMState = {
            url: window.location.href,
            html: processedHtml,
            title: document.title,
            timestamp: new Date().toISOString(),
            structure: domStructure
        };
        
        // Apply highlight to interactive elements
        console.log('Highlighting interactive elements');
        highlightInteractiveElements(domStructure);
        
        // Step 2: Start DOM update but don't wait for message response
        console.log('Sending DOM update to server via background script');
        
        // Just trigger the DOM update, don't wait for direct response 
        chrome.runtime.sendMessage({
            type: 'dom_update',
            task_id,
            dom_data: domData,
            result: []
        });
        
        // Instead of relying on message response, wait for the processing status to change
        console.log('Waiting for DOM update to complete...');
        const waitForStatus = await waitForProcessingStatus(task_id, 'completed', 120000);
        
        if (!waitForStatus) {
            // If completion never happened, check if there's an error status
            const taskState = await chrome.storage.local.get(['taskState']);
            if (taskState.taskState?.processingStatus === 'error') {
                return { success: false, error: 'DOM update failed with error' };
            }
            
            return { success: false, error: 'DOM update timed out waiting for completion' };
        }
        
        // Get the update result from storage
        const updateResult = await getLatestUpdateResult(task_id);
        
        if (!updateResult.success) {
            console.error('Failed to get update result:', updateResult.error);
            return { success: false, error: updateResult.error };
        }
        
        console.log('DOM update successful:', updateResult);
        
        // Check if backend signaled to complete
        const isDone = !!updateResult.data?.result?.is_done;
        
        // If is_done is set to true, update activeSession in storage directly
        if (isDone) {
            console.log('Server indicated workflow is complete (is_done=true)');
            await chrome.storage.local.get(['activeSession'], async (result) => {
                if (result.activeSession) {
                    await chrome.storage.local.set({
                        activeSession: {
                            ...result.activeSession,
                            status: 'completed'
                        }
                    });
                    console.log('Updated activeSession.status to completed');
                }
            });
        }
        
        // Step 3: Handle any actions returned from the server
        if (updateResult.data?.result?.actions?.length > 0) {
            console.log('Executing actions from update response');
            const actions = updateResult.data.result.actions;
            
            try {
                // Mark status as executing actions
                await chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'executing_actions'
                });
                
                const actionResults = await handleAutomationActions(actions);
                console.log('Action execution results:', actionResults);
                
                // Mark status as completed after actions are done
                await chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'completed'
                });
            } catch (actionError) {
                console.error('Error executing actions:', actionError);
                
                // Mark status as error if actions failed
                await chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'error'
                });
                
                return { 
                    success: false, 
                    error: actionError instanceof Error ? actionError.message : String(actionError)
                };
            }
        } else {
            // Explicitly mark as completed if no actions needed
            await chrome.runtime.sendMessage({
                type: 'updateProcessingStatus',
                task_id,
                status: 'completed'
            });
        }
        
        console.log('Is this iteration the final one?', isDone);
        
        return { 
            success: true,
            isDone
        };
    } catch (error) {
        console.error('Error in single DOM process iteration:', error);
        return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

// Function to check if domain has changed
async function checkDomainChange(currentUrl: string, task_id: string): Promise<{domainChanged: boolean}> {
    return new Promise((resolve) => {
        try {
            // Use a timeout to prevent hanging if no response is received
            const timeoutId = setTimeout(() => {
                console.warn('Domain change check timed out, assuming no change');
                resolve({ domainChanged: false });
            }, 2000);
            
            chrome.runtime.sendMessage({
                type: 'checkDomainChange',
                currentUrl,
                task_id
            }, (response) => {
                clearTimeout(timeoutId);
                
                if (chrome.runtime.lastError) {
                    console.error('Error checking domain change:', chrome.runtime.lastError);
                    // Default to false if there's an error
                    resolve({ domainChanged: false });
                } else {
                    resolve({ domainChanged: !!response?.domainChanged });
                }
            });
        } catch (error) {
            console.error('Exception during domain change check:', error);
            resolve({ domainChanged: false });
        }
    });
}

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    console.log('Content script received message:', message.type);

    if (message.type === 'ping') {
        sendResponse({ success: true });
        return true;
    }
    
    if (message.type === 'singleDOMProcess' && message.task_id) {
        createSidebarContainer(); 
        
        singleDOMProcessIteration(message.task_id)
            .then((result) => {
                console.log('Single DOM process complete:', result);
                sendResponse(result);
            })
            .catch(error => {
                console.error('Error in singleDOMProcess:', error);
                sendResponse({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            });
        
        return true;
    }

    if (message.type === 'executeActions' && Array.isArray(message.actions)) {
        handleAutomationActions(message.actions)
            .then(results => {
                sendResponse({ success: true, results });
            })
            .catch(error => {
                console.error('Error executing actions:', error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Keep channel open for async response
    }

    if (message.type === 'processDOM' && message.task_id) {
        createSidebarContainer(); // Ensure container exists
        processDOM(message.task_id)
            .then((domData) => {
                sendResponse({ success: true, domData });
            })
            .catch(error => {
                console.error('Error in processDOM:', error);
                sendResponse({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error) 
                });
            });
        return true; 
    }
    else if (message.type === 'startSequentialProcessing' && message.task_id) {
        createSidebarContainer(); // Ensure container exists
        sequentialDOMProcessing(message.task_id, message.maxIterations || 10)
            .then((result) => {
                sendResponse({ success: true, result });
            })
            .catch(error => {
                console.error('Error in sequential processing:', error);
                sendResponse({ 
                    success: false, 
                    error: error instanceof Error ? error.message : String(error)
                });
            });
        return true; // Keep channel open for async response
    }
    else if (message.type === 'toggleUI' || message.type === 'toggleSidebar') {
        const isVisible = toggleSidebar();
        sendResponse({ success: true, isVisible });
        return true;
    }
    else if (message.type === 'updateSidebarState') {
        updateSidebarState(message.isOpen || false);
        sendResponse({ success: true });
        return true;
    }
    else if (message.type === 'workflowReset') {
        // Clear all highlights and reset UI state
        clearAllHighlights();
        console.log('Workflow reset received, clearing DOM highlights');
        sendResponse({ success: true });
        return true;
    }

    // If we reach here, it was an unknown message type
    return false;
});

async function handleAutomationActions(actions: Action[]) {
    try {
        console.log('Executing automation actions:', actions);
        
        // Validate actions
        if (!Array.isArray(actions) || actions.length === 0) {
            console.error('Invalid actions array:', actions);
            throw new Error('Invalid actions array');
        }
        
        // Validate each action
        for (const action of actions) {
            if (!action.type) {
                console.error('Invalid action missing type:', action);
                throw new Error('Invalid action: missing type');
            }
            
            // Validate based on action type
            if (action.type === 'click' || action.type === 'scroll' || action.type === 'input') {
                if (!action.element_id && !action.xpath_ref && !action.selector) {
                    console.error('Invalid action missing target element:', action);
                    throw new Error(`Invalid ${action.type} action: missing target element`);
                }
            }
            
            if (action.type === 'input' && !action.text) {
                console.error('Invalid input action missing text:', action);
                throw new Error('Invalid input action: missing text');
            }
            
            if (action.type === 'navigate' && !action.url) {
                console.error('Invalid navigate action missing URL:', action);
                throw new Error('Invalid navigate action: missing URL');
            }
        }
        
        // Execute actions with timeout protection - longer timeout (120 seconds)
        const timeoutPromise = new Promise<boolean[]>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Action execution timed out after 120 seconds'));
            }, 120000); // 2 minutes timeout
        });
        
        // Race between execution and timeout
        const results = await Promise.race([
            automationHandler.executeActions(actions),
            timeoutPromise
        ]);
        
        console.log('Action execution complete with results:', results);
        
        // Check if any action failed
        if (results.includes(false)) {
            const failedIndex = results.findIndex(r => r === false);
            console.warn(`Action at index ${failedIndex} failed:`, actions[failedIndex]);
        }
        
        return results;
    } catch (error) {
        console.error('Error in handleAutomationActions:', error);
        throw error; // Re-throw for proper error handling upstream
    }
}

// Initialize on content script load
console.log('Creating sidebar container on content script load');
createSidebarContainer();

const colors = [
    "#FF0000", "#00FF00", "#0000FF", "#FFA500",
    "#800080", "#008080", "#FF69B4", "#4B0082",
    "#FF4500", "#2E8B57", "#DC143C", "#4682B4",
];

/**
 * Utility function to get an element by XPath, including searching in iframes
 * This is useful for targeting elements in the DOM structure with iframe contents
 */
function getElementByXPathIncludingIframes(xpath: string): HTMLElement | null {
    try {
        // First try to find the element in the main document
        const result = document.evaluate(
            xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
        );
        const element = result.singleNodeValue as HTMLElement;
        
        if (element) {
            return element;
        }
        
        // If not found, check if it's in an iframe
        // Look for navigator-iframe-data tags in the DOM xpath which might indicate
        // the element is inside an iframe
        const iframePathMatch = xpath.match(/\/navigator-iframe-data\[@data-iframe-id="([^"]+)"\]/);
        
        if (iframePathMatch) {
            const iframeId = iframePathMatch[1];
            const iframeElement = document.querySelector(`iframe[data-navigator-iframe-id="${iframeId}"]`);
            
            if (iframeElement && iframeElement instanceof HTMLIFrameElement) {
                try {
                    // Extract the part of xpath after the navigator-iframe-data part
                    const remainingXpath = xpath.substring(xpath.indexOf(iframePathMatch[0]) + iframePathMatch[0].length);
                    
                    // Try to evaluate this xpath in the iframe content document
                    if (iframeElement.contentDocument) {
                        const iframeResult = iframeElement.contentDocument.evaluate(
                            remainingXpath, iframeElement.contentDocument, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                        );
                        return iframeResult.singleNodeValue as HTMLElement;
                    }
                } catch (iframeError) {
                    console.error('Error evaluating XPath in iframe:', iframeError);
                }
            }
        }
        
        // If we still haven't found it, try searching in all accessible iframes
        const iframes = document.querySelectorAll('iframe');
        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            if (iframe.contentDocument) {
                try {
                    const iframeResult = iframe.contentDocument.evaluate(
                        xpath, iframe.contentDocument, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
                    );
                    const iframeElement = iframeResult.singleNodeValue as HTMLElement;
                    if (iframeElement) {
                        return iframeElement;
                    }
                } catch (iframeError) {
                    // Silently continue to the next iframe
                }
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error finding element by XPath:', error);
        return null;
    }
}