// messaging/index.ts
// Functions for handling messaging between content script and background script

import { Message } from '../types';
import { createSidebarContainer, toggleSidebar, updateSidebarState, isChromeSidePanelSupported } from '../sidebar';
import { singleDOMProcessIteration } from '../dom/processor';
import { clearAllHighlights } from '../highlight';
import { handleAutomationActions } from '../automation';

/**
 * Initialize message listener for content script
 */
export function initializeMessageListener(): void {
    // Check if Chrome's sidePanel API is available
    const isChromeWithSidePanel = isChromeSidePanelSupported();
    
    chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
        console.log('Content script received message:', message.type);

        if (message.type === 'ping') {
            sendResponse({ success: true });
            return true;
        }
        
        if (message.type === 'singleDOMProcess' && message.task_id) {
            // Only create the custom container for non-Chrome browsers
            if (!isChromeWithSidePanel) {
                createSidebarContainer();
            }
            
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

        // if (message.type === 'processDOM' && message.task_id) {
        //     // Only create the custom container for non-Chrome browsers
        //     if (!isChromeWithSidePanel) {
        //         createSidebarContainer();
        //     }
            
        //     processDOM(message.task_id)
        //         .then((domData) => {
        //             sendResponse({ success: true, domData });
        //         })
        //         .catch(error => {
        //             console.error('Error in processDOM:', error);
        //             sendResponse({ 
        //                 success: false, 
        //                 error: error instanceof Error ? error.message : String(error)
        //             });
        //         });
        //     return true; 
        // }
        // else if (message.type === 'startSequentialProcessing' && message.task_id) {
        //     // Only create the custom container for non-Chrome browsers
        //     if (!isChromeWithSidePanel) {
        //         createSidebarContainer();
        //     }
            
        //     sequentialDOMProcessing(message.task_id, message.maxIterations || 10)
        //         .then((result) => {
        //             sendResponse({ success: true, result });
        //         })
        //         .catch(error => {
        //             console.error('Error in sequential processing:', error);
        //             sendResponse({ 
        //                 success: false, 
        //                 error: error instanceof Error ? error.message : String(error)
        //             });
        //         });
        //     return true; // Keep channel open for async response
        // }
        else if (message.type === 'toggleUI' || message.type === 'toggleSidebar') {
            // Use Chrome's sidePanel API if available, otherwise fall back to custom sidebar
            if (isChromeWithSidePanel) {
                // Forward the request to the background script which will handle the Chrome sidePanel API
                chrome.runtime.sendMessage({ type: 'toggleSidePanel' }, (response) => {
                    sendResponse(response);
                });
            } else {
                const isVisible = toggleSidebar();
                sendResponse({ success: true, isVisible });
            }
            return true;
        }
        else if (message.type === 'updateSidebarState') {
            // Use Chrome's sidePanel API if available, otherwise fall back to custom sidebar
            if (isChromeWithSidePanel) {
                // Forward to background script
                if (message.isOpen) {
                    chrome.runtime.sendMessage({ type: 'openSidePanel' }, (response) => {
                        sendResponse(response);
                    });
                } else {
                    chrome.runtime.sendMessage({ type: 'closeSidePanel' }, (response) => {
                        sendResponse(response);
                    });
                }
            } else {
                updateSidebarState(message.isOpen || false);
                sendResponse({ success: true });
            }
            return true;
        }
        else if (message.type === 'resetWorkflow') {
            // Clear all highlights and reset UI state
            clearAllHighlights();
            console.log('Workflow reset received, clearing DOM highlights');
            sendResponse({ success: true });
            return true;
        }
        else if (message.type === 'stopAutomation') {
            clearAllHighlights();
            // Any other cleanup needed in content script
            sendResponse({ success: true });
            return true;
        }

        // If we reach here, it was an unknown message type
        return false;
    });
} 