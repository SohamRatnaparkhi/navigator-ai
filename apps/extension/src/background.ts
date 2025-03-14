/* eslint-disable @typescript-eslint/no-explicit-any */
import { DOMUpdate, Message, ProcessingStatus } from './types';

console.log('Background script initializing...');

const API_BASE_URL = 'http://localhost:8000';
let monitoringInterval: NodeJS.Timeout | null = null;
let currentIterations = 0;
let isPaused = false;

// Store the most recent server update response to avoid message passing issues
let lastUpdateResponse: { 
    timestamp: string; 
    task_id: string; 
    data: any;
} | null = null;

// Store active task session
let activeSession: {
    taskId: string;
    status: 'active' | 'completed' | 'error' | 'paused';
    isPaused?: boolean;
    isRunning?: boolean;
} | null = null;

// Initialize session from storage on extension load
chrome.storage.local.get(['activeSession'], (result) => {
    console.log('Loaded active session from storage:', result.activeSession);
    if (result.activeSession) {
        activeSession = result.activeSession;
        isPaused = result.activeSession.isPaused || false;
    }
});

// Helper function to check if a URL is accessible by content scripts
function isValidUrl(url: string): boolean {
    return typeof url === 'string' &&
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('chrome-search://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://');
}

// Handle extension icon click - toggle sidebar
chrome.action.onClicked.addListener((tab) => {
    console.log('Extension icon clicked, toggling sidebar in tab:', tab.id);
    if (tab.id && tab.url && isValidUrl(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'toggleSidebar' })
            .catch(err => {
                console.error('Error sending toggleSidebar message:', err);
                // Try injecting content script if it's not loaded
                chrome.scripting.executeScript({
                    target: { tabId: tab.id! },
                    files: ['content.js']
                })
                    .then(() => {
                        // Now try sending the message again
                        chrome.tabs.sendMessage(tab.id!, { type: 'toggleSidebar' });
                    })
                    .catch(injectErr => {
                        console.error('Failed to inject content script:', injectErr);
                    });
            });
    } else {
        console.log('Cannot toggle sidebar on this page (likely a chrome:// URL)');
    }
});

chrome.runtime.onMessage.addListener(async (message: Message, sender, sendResponse) => {
    console.log('Background received message:', message.type, sender?.tab?.id);

    try {
        if (message.type === 'startTask') {
            await handleStartTask(message, sendResponse);
            return true; // Keep channel open for async response
        } else if (message.type === 'startMonitoring') {
            startMonitoring(message.task_id!);
            sendResponse({ success: true });
        } else if (message.type === 'stopMonitoring') {
            stopMonitoring();
            sendResponse({ success: true });
        } else if (message.type === 'dom_update') {
            const result = await handleDOMUpdate(message);
            sendResponse(result);
        } else if (message.type === 'resetIterations') {
            // Reset iteration counter when requested
            currentIterations = 0;
            console.log('Reset iterations counter to 0');
            sendResponse({ success: true });
        } else if (message.type === 'check_processing_status') {
            // Check if the task is marked as completed
            const taskStatus = await chrome.storage.local.get(['activeSession']);
            const isDone = taskStatus.activeSession?.status === 'completed';
            console.log('Checking processing status, isDone:', isDone);
            sendResponse({ isDone });
        } else if (message.type === 'toggleSidebar') {
            // Find the active tab and send toggle message
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs.length > 0 && tabs[0].id && tabs[0].url && isValidUrl(tabs[0].url)) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'toggleSidebar' })
                        .then(() => {
                            sendResponse({ success: true });
                        })
                        .catch(err => {
                            console.error('Error sending toggleSidebar:', err);
                            sendResponse({ success: false, error: err.message });
                        });
                } else {
                    console.log('Cannot toggle sidebar on this page (likely a chrome:// URL)');
                    sendResponse({ success: false, error: 'Cannot toggle sidebar on this page' });
                }
            });
            return true; // Keep channel open for async response
        } else if (message.type === 'pauseMonitoring') {
            pauseMonitoring();
            sendResponse({ success: true });
        } else if (message.type === 'resumeMonitoring') {
            resumeMonitoring();
            sendResponse({ success: true });
        } else if (message.type === 'updateProcessingStatus' && message.task_id && message.status) {
            // Handle processing status updates from content script
            await updateProcessingStatus(message.task_id, message.status as ProcessingStatus);
            sendResponse({ success: true });
        }
    } catch (error) {
        console.error('Error in background script:', error);
        sendResponse({ success: false, error: 'Background script error' });
    }

    return true; // Keep channel open for async response
});

// Helper function to update processing status
async function updateProcessingStatus(task_id: string, status: ProcessingStatus) {
    console.log(`Updating processing status for task ${task_id} to ${status}`);
    
    const result = await chrome.storage.local.get(['taskState']);
    let taskState = result.taskState || {};
    
    taskState = {
        ...taskState,
        processingStatus: status,
        lastUpdateTimestamp: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ taskState });
    
    // Also broadcast this status change to all listeners
    chrome.runtime.sendMessage({
        type: 'processingStatusUpdate',
        task_id,
        status
    }).catch(err => console.error('Error broadcasting status update:', err));
}

async function handleDOMUpdate(message: Message) {
    try {
        if (!message.task_id || !message.dom_data) {
            console.error('Missing required fields in DOM update');
            await updateProcessingStatus(message.task_id || '', 'error');
            return { success: false, error: 'Missing required fields' };
        }

        console.log('Received pre-processed DOM data for task:', message.task_id);
        
        // Update status to indicate we're in the update process
        await updateProcessingStatus(message.task_id, 'updating');

        // The DOM structure is already parsed by the content script
        const updateData: DOMUpdate = {
            task_id: message.task_id,
            dom_data: message.dom_data,
            result: Array.isArray(message.result) ? message.result : [],
            iterations: currentIterations,
            structure: message.dom_data.structure ?? {}
        };

        // Step 1: Store that we're starting a server update
        await chrome.storage.local.set({
            currentDOMUpdate: {
                task_id: message.task_id,
                status: 'waiting_for_server',
                startTime: new Date().toISOString()
            }
        });
        
        await updateProcessingStatus(message.task_id, 'waiting_for_server');
        
        console.log('Sending DOM update to API:', updateData.task_id);
        let response;
        let data;
        
        try {
            response = await fetch(`${API_BASE_URL}/tasks/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(updateData),
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Server error ${response.status}: ${JSON.stringify(errorData)}`);
            }
            
            data = await response.json();
            console.log('DOM update successful:', data);
            
            // Store the response for later querying
            lastUpdateResponse = {
                timestamp: new Date().toISOString(),
                task_id: message.task_id,
                data: data
            };
            
            // Save the update response to storage for content script to retrieve
            await chrome.storage.local.set({
                lastUpdateResponse: lastUpdateResponse,
                currentDOMUpdate: {
                    task_id: message.task_id,
                    status: 'completed',
                    result: data,
                    completedTime: new Date().toISOString()
                }
            });
            
        } catch (error) {
            console.error('Error in server update:', error);
            await updateProcessingStatus(message.task_id, 'error');
            
            // Store error state
            await chrome.storage.local.set({
                currentDOMUpdate: {
                    task_id: message.task_id,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                    completedTime: new Date().toISOString()
                }
            });
            
            throw error; // Re-throw for later handling
        }
        
        // Update status based on the response
        if (data.result?.actions && data.result.actions.length > 0) {
            // If there are actions, indicate they need to be executed
            await updateProcessingStatus(message.task_id, 'executing_actions');
        } else {
            // Otherwise mark as completed for this iteration
            await updateProcessingStatus(message.task_id, 'completed');
        }
        
        // Only stop monitoring if is_done is true in the response
        if (data.result?.is_done && activeSession) {
            console.log('Task marked as done by the server, stopping monitoring');
            activeSession.status = 'completed';
            await chrome.storage.local.set({ activeSession });
            stopMonitoring();
        }

        return {
            success: true,
            data: data,
            error: null
        };
    } catch (error) {
        console.error('Error in handleDOMUpdate:', error);
        // Optionally update active session status on error
        if (activeSession) {
            activeSession.status = 'error';
            await chrome.storage.local.set({ activeSession });
        }
        
        // Update processing status to error
        if (message.task_id) {
            await updateProcessingStatus(message.task_id, 'error');
        }

        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Failed to update DOM'
        };
    }
}

async function handleStartTask(message: Message, sendResponse: (response?: any) => void) {
    try {
        console.log('Starting task:', message.task);

        // If there's an active session, use that task ID
        if (activeSession?.taskId && activeSession.status === 'active') {
            console.log('Using existing active session:', activeSession.taskId);
            sendResponse({ task_id: activeSession.taskId });
            return;
        }

        // Otherwise create a new task
        console.log('Creating new task with server');
        const response = await fetch(`${API_BASE_URL}/tasks/create`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ task: message.task }),
        });

        const data = await response.json();
        console.log('Task created successfully:', data.task_id);

        // Store the new session
        activeSession = {
            taskId: data.task_id,
            status: 'active',
            isPaused: false
        };

        // Persist session
        await chrome.storage.local.set({ activeSession });

        sendResponse({ task_id: data.task_id });
    } catch (error) {
        console.error('Error creating task:', error);
        sendResponse({ error: 'Failed to create task' });
    }
}

async function startMonitoring(task_id: string) {
    console.log('Starting monitoring for task:', task_id);

    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }

    // Reset iterations counter when starting workflow
    currentIterations = 0;
    isPaused = false;
    
    // Store a flag to indicate if DOM update is in progress
    let isUpdateInProgress = false;

    // Simple function to process one iteration
    const processOneIteration = async () => {
        if (isPaused) {
            console.log('Monitoring is paused, skipping iteration');
            return;
        }
        
        if (isUpdateInProgress) {
            console.log('Update already in progress, skipping this iteration');
            return;
        }
        
        isUpdateInProgress = true;
        
        try {
            console.log('Processing DOM for iteration:', currentIterations + 1);
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]?.id || !tabs[0]?.url || !isValidUrl(tabs[0].url)) {
                console.log('Cannot process DOM on this page (likely a chrome:// URL)');
                isUpdateInProgress = false;
                return;
            }
            
            const tabId = tabs[0].id;
            
            // Make sure content script is loaded
            try {
                await chrome.tabs.sendMessage(tabId, { type: 'ping' });
            } catch (error) {
                console.log('Content script not loaded, injecting it...', error);
                await chrome.scripting.executeScript({
                    target: { tabId },
                    files: ['content.js']
                });
            }
            
            // Use startSequentialProcessing in content script - this will handle a single iteration
            const response = await new Promise<any>((resolve) => {
                chrome.tabs.sendMessage(tabId, {
                    type: 'singleDOMProcess',
                    task_id
                }, (result) => {
                    if (chrome.runtime.lastError) {
                        console.error('Error sending message:', chrome.runtime.lastError);
                        resolve({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        resolve(result);
                    }
                });
            });
            
            console.log('DOM processing complete:', response);
            
            if (response?.success) {
                currentIterations++;
                
                // Update popup with current iterations
                chrome.runtime.sendMessage({
                    type: 'iterationUpdate',
                    iterations: currentIterations
                });
                
                const taskState = await chrome.storage.local.get(['taskState']);
                if (taskState.taskState) {
                    await chrome.storage.local.set({
                        taskState: {
                            ...taskState.taskState,
                            iterations: currentIterations
                        }
                    });
                }
                
                // Check if task is done
                if (response.isDone) {
                    console.log('Task marked as done, stopping monitoring');
                    if (activeSession) {
                        activeSession.status = 'completed';
                        await chrome.storage.local.set({ activeSession });
                    }
                    stopMonitoring();
                    return;
                }
            } else {
                console.error('DOM processing failed:', response?.error);
            }
        } catch (error) {
            console.error('Error in monitoring process:', error);
        } finally {
            isUpdateInProgress = false;
        }
    };
    
    // Set up interval that respects the previous iteration completion
    monitoringInterval = setInterval(async () => {
        if (!isUpdateInProgress && !isPaused) {
            await processOneIteration();
        }
    }, 2000);
    
    // Start the first iteration immediately
    processOneIteration();
}

function stopMonitoring() {
    console.log('Stopping monitoring');
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    
    // Reset task state to idle
    chrome.storage.local.get(['taskState'], async (result) => {
        if (result.taskState) {
            // Reset processing status
            await chrome.storage.local.set({
                taskState: {
                    ...result.taskState,
                    processingStatus: 'idle',
                    lastUpdateTimestamp: new Date().toISOString()
                },
                // Clear any pending DOM updates
                currentDOMUpdate: null
            });
        }
    });
}

function pauseMonitoring() {
    console.log('Pausing automation monitoring');
    isPaused = true;

    if (activeSession) {
        activeSession.isPaused = true;
        chrome.storage.local.set({ activeSession });
    }
    
    // Update task state to paused
    chrome.storage.local.get(['taskState'], async (result) => {
        if (result.taskState) {
            // Set processing status to paused
            await updateProcessingStatus(activeSession?.taskId || '', 'paused');
        }
    });

    chrome.runtime.sendMessage({
        type: 'pauseStateChanged',
        isPaused: true
    });
}

function resumeMonitoring() {
    console.log('Resuming automation monitoring');
    isPaused = false;

    if (activeSession) {
        activeSession.isPaused = false;
        chrome.storage.local.set({ activeSession });
    }
    
    // Update task state to idle (ready for next process)
    chrome.storage.local.get(['taskState'], async (result) => {
        if (result.taskState) {
            // Set processing status to idle so next iteration can start
            await updateProcessingStatus(activeSession?.taskId || '', 'idle');
        }
    });

    chrome.runtime.sendMessage({
        type: 'pauseStateChanged',
        isPaused: false
    });
}