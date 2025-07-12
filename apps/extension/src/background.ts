/* eslint-disable @typescript-eslint/no-explicit-any */
import { ExecuteActionResult } from '@navigator-ai/core';
import { getAxiosInstance } from './constants/AxiosInstance';
import { DOMUpdate, Message, ProcessingStatus, TaskState } from './types';
import { isValidUrl } from './utils/url';

console.log('Background script initializing...');

let monitoringInterval: NodeJS.Timeout | null = null;
let currentIterations = 0;
let isPaused = false;


let lastUpdateResponse: {
    timestamp: string;
    task_id: string;
    data: any;
} | null = null;

let activeSession: {
    taskId: string;
    status: 'active' | 'completed' | 'error' | 'paused';
    isPaused?: boolean;
    isRunning?: boolean;
} | null = null;

chrome.storage.local.get(['activeSession'], (result) => {
    console.log('Loaded active session from storage:', result.activeSession);
    if (result.activeSession) {
        activeSession = result.activeSession;
        isPaused = result.activeSession.isPaused || false;
    }
});



chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed, setting up sidePanel...');

    if (chrome.sidePanel) {
        console.log('Chrome sidePanel API available, configuring...');

        chrome.sidePanel.setOptions({
            enabled: true,
            path: 'popup.html'
        });

        chrome.storage.local.get(['sidePanelState'], (result) => {
            if (!result.sidePanelState) {
                chrome.storage.local.set({ sidePanelState: 'closed' });
            }
        });
    } else {
        console.log('Chrome sidePanel API not available, will use custom sidebar implementation');
    }
});

chrome.action.onClicked.addListener((tab) => {
    console.log('Extension icon clicked, toggling sidebar in tab:', tab.id);

    if (chrome.sidePanel) {
        chrome.storage.local.get(['sidePanelState'], (result) => {
            const isOpen = result.sidePanelState === 'open';

            if (isOpen) {
                chrome.sidePanel.setOptions({ enabled: false });
                chrome.storage.local.set({ sidePanelState: 'closed' });
            } else {
                chrome.sidePanel.setOptions({ enabled: true });
                if (tab.id) {
                    chrome.sidePanel.open({ tabId: tab.id });
                } else {
                    chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
                }
                chrome.storage.local.set({ sidePanelState: 'open' });
            }
        });
        return;
    }

    if (tab.id && tab.url && isValidUrl(tab.url)) {
        chrome.tabs.sendMessage(tab.id, { type: 'toggleSidebar' })
            .catch(err => {
                console.error('Error sending toggleSidebar message:', err);
                chrome.scripting.executeScript({
                    target: { tabId: tab.id!, allFrames: true },
                    files: ['content.js']
                })
                    .then(() => {
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

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    (async () => {
        console.log('Background received message:', message.type, sender?.tab?.id);

        try {
            if (message.type === 'startTask') {
                await handleStartTask(message, sendResponse);
            } else if (message.type === 'startMonitoring') {
                startMonitoring(message.task_id!);
                sendResponse({ success: true });
            } else if (message.type === 'stopMonitoring') {
                console.log('Received request to stop monitoring');
                stopMonitoring();
                sendResponse({ success: true });
            } else if (message.type === 'dom_update') {
                const result = await handleDOMUpdate(message);
                sendResponse(result);
            } else if (message.type === 'resetIterations') {
                currentIterations = 0;
                console.log('Reset iterations counter to 0');
                sendResponse({ success: true });
            } else if (message.type === 'check_processing_status') {
                const storageData = await chrome.storage.local.get(['activeSession', 'taskState', 'lastUpdateResponse']);

                const sessionDone = storageData.activeSession?.status === 'completed';
                const lastUpdateDone = storageData.lastUpdateResponse?.data?.result?.is_done === true;
                const processingDone = storageData.taskState?.processingStatus === 'completed';

                const isDone = sessionDone || lastUpdateDone || processingDone;

                console.log('Checking processing status, isDone:', isDone, {
                    sessionDone,
                    lastUpdateDone,
                    processingDone
                });

                sendResponse({ isDone });
            } else if (message.type === 'pauseMonitoring') {
                pauseMonitoring();
                sendResponse({ success: true });
            } else if (message.type === 'resumeMonitoring') {
                resumeMonitoring();
                sendResponse({ success: true });
            } else if (message.type === 'updateProcessingStatus' && message.task_id && message.status) {
                await updateProcessingStatus(message.task_id, message.status as ProcessingStatus);
                sendResponse({ success: true });
            } else if (message.type === 'resetWorkflow') {
                await resetWorkflow();
                sendResponse({ success: true });
            } else if (message.type === 'switchTab') {
                if (message.tabId) {
                    try {
                        const id = Number(message.tabId);
                        console.log(`Switching to tab ${id} abcd`);
                        chrome.tabs.get(id, (tab) => {
                            if (tab) {
                                chrome.tabs.update(id, { active: true });
                                sendResponse({ success: true });
                            } else {
                                console.error('Tab with id', id, 'not found');
                                sendResponse({ success: false, error: 'Tab with id ' + id + ' not found' });
                            }
                        });
                    } catch (error) {
                        console.error('Error switching tab:', error);
                        sendResponse({ success: false, error: String(error) });
                    }
                } else {
                    sendResponse({ success: false, error: 'No tabId provided' });
                }
            }
        } catch (error) {
            console.error('Error in background script:', error);
            sendResponse({ success: false, error: 'Background script error' });
        }
    })();

    return true; // Keep the channel open for all messages
});

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

        await updateProcessingStatus(message.task_id, 'updating');

        let iterationResults: {task_id: string, result: ExecuteActionResult[]}[] = (await chrome.storage.local.get(['iterationResults'])).iterationResults || [];

        iterationResults = iterationResults.filter(result => result.task_id === message.task_id);

        const currentTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0] 

        const updateData: DOMUpdate = {
            task_id: message.task_id,
            dom_data: message.dom_data,
            result: iterationResults,
            iterations: currentIterations,
            structure: message.dom_data.structure ?? {},
            openTabsWithIds: (await chrome.tabs.query({})).map(tab => ({ id: tab.id || -1, url: tab.url || '' })),
            currentTab: {
                id: currentTab?.id || -1,
                url: currentTab?.url || ''
            }
        };

        console.log("Request")
        console.log(updateData)

        await chrome.storage.local.set({
            currentDOMUpdate: {
                task_id: message.task_id,
                status: 'waiting_for_server',
                startTime: new Date().toISOString()
            }
        });

        await updateProcessingStatus(message.task_id, 'waiting_for_server');

        console.log('Sending DOM update to API:', updateData.task_id);
        let data;

        try {
            const instance = await getAxiosInstance();
            const res = await instance.post('/tasks/update', updateData);
            data = res.data;
            console.log('DOM update successful:', data);

            lastUpdateResponse = {
                timestamp: new Date().toISOString(),
                task_id: message.task_id,
                data: data
            };

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

            await chrome.storage.local.set({
                currentDOMUpdate: {
                    task_id: message.task_id,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error),
                    completedTime: new Date().toISOString()
                }
            });

            throw error;
        }

        return {
            success: true,
            data: data,
            error: null
        };
    } catch (error) {
        console.error('Error in handleDOMUpdate:', error);
        await stopMonitoring('error');
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

async function handleStartTask(message: Message, sendResponse: (response?: any) => void) {
    try {
        console.log('Starting task:', message.task);

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.url && !isValidUrl(tabs[0].url)) {
            console.log('Invalid URL detected, navigating to Google');
            await chrome.tabs.update(tabs[0].id!, { url: 'https://www.google.com' });
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        if (activeSession) {
            console.log('Stopping existing session:', activeSession.taskId);
            await stopMonitoring('idle');
        }

        console.log('Creating new task with server - ', message.task);
        const instance = await getAxiosInstance();
        const {data, status} = await instance.post('/tasks/create', { task: message.task });

        if (status !== 200) {
            console.error('Error creating task:', data);
            sendResponse({ error: 'Failed to create task' });
            return;
        }

        console.log('Task created successfully:', data.task_id);

        activeSession = {
            taskId: data.task_id,
            status: 'active',
            isPaused: false
        };

        await chrome.storage.local.set({ activeSession });

        sendResponse({ task_id: data.task_id });
        return;
    } catch (error) {
        console.error('Error creating task:', error);
        await stopMonitoring('error');
        sendResponse({ error: 'Failed to create task' });
    }
}

async function startMonitoring(task_id: string) {
    console.log('Starting monitoring for task:', task_id);

    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }

    currentIterations = 0;
    isPaused = false;

    // Initial tab validation with retries
    const initialTab = await getValidTab();
    if (!initialTab) {
        console.error('Failed to get valid tab after retries');
        await stopMonitoring('error');
        return;
    }

    // Check if initial URL is valid
    const url = initialTab.url!;
    const isValid = isValidUrl(url);
    console.log(`Initial URL check: ${url}, Valid: ${isValid}`);
    if (!isValid) {
        console.log('Invalid URL detected, navigating to Google before starting monitoring');
        try {
            await chrome.tabs.update(initialTab.id!, { url: 'https://www.google.com' });
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error('Failed to navigate to Google:', error);
            await stopMonitoring('error');
            return;
        }
    }

    let isUpdateInProgress = false;

    const processOneIteration = async (): Promise<boolean> => {
        if (!activeSession || activeSession.status !== 'active') {
            console.log('Skipping iteration as session is not active');
            return false;
        }

        if (isPaused) {
            console.log('Monitoring is paused, skipping iteration');
            return true; // Return true to continue monitoring when resumed
        }

        if (isUpdateInProgress) {
            console.log('Update already in progress, skipping this iteration');
            return true;
        }

        isUpdateInProgress = true;

        try {
            console.log('Starting iteration:', currentIterations + 1);
            currentIterations++;

            // Get current tab with retries
            const currentTab = await getValidTab();
            if (!currentTab) {
                console.log('Cannot get valid tab for iteration');
                return false;
            }

            const url = currentTab.url!;
            const isValid = isValidUrl(url);
            console.log(`Checked URL in processOneIteration: ${url}, Valid: ${isValid}`);
            if (!isValid) {
                console.log('Cannot start monitoring on invalid URL');
                chrome.runtime.sendMessage({ type: 'invalidURL' });
                return false;
            }

            const tabId = currentTab.id!;
            const response = await sendProcessMessage(tabId, task_id);

            console.log('DOM processing complete:', response);

            const taskState = await chrome.storage.local.get(['taskState']);
            if (taskState.taskState) {
                await chrome.storage.local.set({
                    taskState: {
                        ...taskState.taskState,
                        iterations: currentIterations
                    }
                });
            }

            chrome.runtime.sendMessage({
                type: 'iterationUpdate',
                iterations: currentIterations
            });

            if (response?.success) {
                if (response.isDone) {
                    console.log('Task marked as done, stopping monitoring');
                    if (activeSession) {
                        activeSession.status = 'completed';
                        await chrome.storage.local.set({ activeSession });
                    }
                    await stopMonitoring('completed');
                    return false; // Stop monitoring
                }
                return true; // Continue monitoring
            } else {
                console.error('DOM processing failed:', response?.error);
                await stopMonitoring('error');
                return false;
            }
        } catch (error) {
            console.error('Error in monitoring process:', error);
            await stopMonitoring('error');
            return false;
        } finally {
            isUpdateInProgress = false;
        }
    };

    // Start the monitoring loop
    const monitoringLoop = async () => {
        while (activeSession && activeSession.status === 'active') {
            if (!isPaused) {
                const shouldContinue = await processOneIteration();
                if (!shouldContinue) {
                    break;
                }
            }
            // Wait a bit before next iteration to prevent overwhelming
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    };

    // Start the monitoring loop
    monitoringLoop();
}

async function getValidTab(maxRetries: number = 5, retryDelay: number = 1000): Promise<chrome.tabs.Tab | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to get valid tab (attempt ${attempt}/${maxRetries})`);
            
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (tabs && tabs.length > 0 && tabs[0]) {
                const tab = tabs[0];
                console.log(`Tab found: ID=${tab.id}, URL=${tab.url}, Status=${tab.status}`);
                
                // Check if tab has required properties
                if (tab.id && tab.url) {
                    // Additional check for tab completeness
                    if (tab.status === 'complete' || tab.status === 'loading') {
                        return tab;
                    } else {
                        console.log(`Tab status is ${tab.status}, waiting for completion...`);
                    }
                } else {
                    console.log('Tab missing required properties (id or url)');
                }
            } else {
                console.log('No active tabs found');
            }

            // If this isn't the last attempt, wait before retrying
            if (attempt < maxRetries) {
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 1.5; // Exponential backoff
            }
        } catch (error) {
            console.error(`Error getting tab on attempt ${attempt}:`, error);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay *= 1.5;
            }
        }
    }

    // Fallback: try to get any available tab information
    try {
        console.log('Attempting fallback tab detection...');
        const allTabs = await chrome.tabs.query({});
        const activeTabs = allTabs.filter(tab => tab.active);
        
        if (activeTabs.length > 0 && activeTabs[0].id && activeTabs[0].url) {
            console.log('Found active tab via fallback method');
            return activeTabs[0];
        }

        // Last resort: get the first available tab with URL
        const validTabs = allTabs.filter(tab => tab.id && tab.url && !tab.url.startsWith('chrome://'));
        if (validTabs.length > 0) {
            console.log('Using first valid tab as fallback');
            return validTabs[0];
        }
    } catch (fallbackError) {
        console.error('Fallback tab detection failed:', fallbackError);
    }

    console.error('Failed to get valid tab after all attempts');
    return null;
}

async function sendProcessMessage(tabId: number, task_id: string, maxRetries: number = 10): Promise<any> {
    let retryCount = 0;

    const attemptSend = async (): Promise<any> => {
        try {
            // Test if content script is available
            await chrome.tabs.sendMessage(tabId, { type: 'ping' });
        } catch (error) {
            console.log('Content script not loaded, injecting it...', error);
            try {
                await chrome.scripting.executeScript({
                    target: { tabId, allFrames: true },
                    files: ['content.js']
                });
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait longer after injection
            } catch (injectError) {
                console.error('Failed to inject content script:', injectError);
                throw injectError;
            }
        }

        // Wait for page to be ready
        await new Promise(resolve => setTimeout(resolve, 2000));

        return new Promise<any>((resolve) => {
            chrome.tabs.sendMessage(tabId, {
                type: 'singleDOMProcess',
                task_id,
            }, (result) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending message:', chrome.runtime.lastError);
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(result);
                }
            });
        });
    };

    while (retryCount < maxRetries) {
        const response = await attemptSend();
        
        if (response.success || !response.error?.includes('back/forward cache')) {
            return response;
        }
        
        console.log(`Retrying due to bfcache error (${retryCount + 1}/${maxRetries})`);
        retryCount++;
        
        if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Progressive delay
        }
    }

    throw new Error('Failed after max retries due to back/forward cache error');
}

async function stopMonitoring(finalStatus: TaskState['status'] = 'idle') {
    console.log(`Stopping monitoring with status: ${finalStatus}`);
    
    // No longer using intervals, so just reset the session state
    currentIterations = 0;
    isPaused = false;
    activeSession = null;

    const result = await chrome.storage.local.get(['taskState']);
    const taskState = result.taskState || {};
    
    await chrome.storage.local.set({ 
        taskState: {
            ...taskState,
            status: finalStatus,
            isRunning: false,
            isPaused: false,
        }
    });

    chrome.storage.local.remove([
        'activeSession',
        'currentDOMUpdate',
        'lastUpdateResponse',
        'iterationResults'
    ]);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'stopAutomation' });
        }
    });

    chrome.runtime.sendMessage({ type: 'stopMonitoring', status: finalStatus });
}

function pauseMonitoring() {
    console.log('Pausing automation monitoring');
    isPaused = true;

    if (activeSession) {
        activeSession.isPaused = true;
        chrome.storage.local.set({ activeSession });
    }

    chrome.storage.local.get(['taskState'], async (result) => {
        if (result.taskState) {
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

    chrome.storage.local.get(['taskState'], async (result) => {
        if (result.taskState) {
            await updateProcessingStatus(activeSession?.taskId || '', 'idle');
        }
    });

    chrome.runtime.sendMessage({
        type: 'pauseStateChanged',
        isPaused: false
    });
}

async function resetWorkflow() {
    console.log('Resetting entire workflow');

    await stopMonitoring();

    currentIterations = 0;

    activeSession = null;

    await chrome.storage.local.set({
        activeSession: null,
        taskState: null,
        currentDOMUpdate: null,
        lastUpdateResponse: null
    });

    chrome.runtime.sendMessage({
        type: 'workflowReset'
    }).catch(err => console.error('Error broadcasting workflow reset:', err));

    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs.length > 0 && tabs[0].id && tabs[0].url && isValidUrl(tabs[0].url)) {
            await chrome.tabs.sendMessage(tabs[0].id, { type: 'workflowReset' })
                .catch(err => console.error('Error sending reset to content script:', err));
        }
    } catch (error) {
        console.error('Error communicating reset to content script:', error);
    }

    console.log('Workflow reset complete');
}