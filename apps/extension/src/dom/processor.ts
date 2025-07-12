import { ExecuteActionResult, parseDOMonServer } from '@navigator-ai/core';
import { Action } from '@navigator-ai/core';
import { FrontendDOMState, ProcessingStatus, Message } from '../types';
import { captureIframeContents } from './iframe';
import { highlightInteractiveElements } from '../highlight';
import { handleAutomationActions } from '../automation';

// Add type for updateResponse
type UpdateResponse = {
    success: boolean;
    data?: { result?: { actions?: Action[]; is_done?: boolean } };
    error?: string;
};

export async function singleDOMProcessIteration(task_id: string): Promise<{ 
    success: boolean; 
    error?: string;
    isDone?: boolean;
    results?: ExecuteActionResult[]
}> {
    try {
        console.log('Starting single DOM process iteration for task:', task_id);
        
        // Wait for document to be ready
        await new Promise<void>(resolve => {
            if (document.readyState === 'complete' || document.readyState === 'interactive') {
                resolve();
            } else {
                document.addEventListener('DOMContentLoaded', () => resolve(), {once: true});
            }
        });
        
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
        console.log('Sending DOM update to server via background script and awaiting response');
        const updateResponse: UpdateResponse = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
                type: 'dom_update',
                task_id,
                dom_data: domData
            }, (response: UpdateResponse) => {
                if (chrome.runtime.lastError) {
                    console.error('Error sending dom_update:', chrome.runtime.lastError);
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response);
                }
            });
        });
        
        if (!updateResponse.success) {
            console.error('DOM update failed:', updateResponse.error);
            return { success: false, error: updateResponse.error || 'DOM update failed' };
        }
        
        console.log('DOM update successful:', updateResponse);
        const updateResult = { data: updateResponse.data }; // Match the structure
        
        const isDone = !!updateResult.data?.result?.is_done;
        
        // Handle actions
        if (updateResult.data?.result?.actions && updateResult.data.result.actions.length > 0) {
            console.log('Executing actions from update response:', updateResult.data.result.actions);
            const actions = updateResult.data.result.actions;
            
            try {
                await chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'executing_actions'
                });
                
                console.log('About to execute actions:', actions);
                const actionResults = await handleAutomationActions(actions);
                console.log('Action execution completed with results:', actionResults);
                
                const iterationResults = (await chrome.storage.local.get(['iterationResults'])).iterationResults || [];
                iterationResults?.push({
                    task_id,
                    result: actionResults
                });
                await chrome.storage.local.set({ iterationResults });
                console.log('Stored iteration results:', actionResults);

                await chrome.runtime.sendMessage({
                    type: 'updateProcessingStatus',
                    task_id,
                    status: 'completed'
                });
            } catch (actionError) {
                console.error('Error executing actions:', actionError);
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
            console.log('No actions to execute, marking as completed');
            await chrome.runtime.sendMessage({
                type: 'updateProcessingStatus',
                task_id,
                status: 'completed'
            });
        }
        
        // If is_done is set to true, update activeSession in storage AFTER executing actions
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
            
            // Explicitly broadcast completion status
            await chrome.runtime.sendMessage({
                type: 'processingStatusUpdate',
                task_id,
                status: 'completed' as ProcessingStatus,
                isDone: true
            }).catch(err => console.error('Error broadcasting completion status:', err));
            
            // Send a message to stop monitoring
            await chrome.runtime.sendMessage({
                type: 'stopMonitoring'
            }).catch(err => console.error('Error stopping monitoring:', err));
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

/**
 * Check if processing is complete
 * @param task_id The task ID
 * @returns Promise with boolean indicating if processing is done
 */
export function checkIfProcessingDone(task_id: string): Promise<boolean> {
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

/**
 * Wait for a specific processing status
 * @param task_id The task ID
 * @param targetStatus The status to wait for
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise with boolean indicating if status was reached
 */
export async function waitForProcessingStatus(
    task_id: string, 
    targetStatus: ProcessingStatus, 
    timeoutMs = 120000
): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const timeoutId = setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            console.warn(`Timeout waiting for ${targetStatus} for task ${task_id}`);
            resolve(false);
        }, timeoutMs);

        const listener = (message: Message) => {
            if (message.type === 'processingStatusUpdate' && 
                message.task_id === task_id) {
                if (message.status === targetStatus) {
                    clearTimeout(timeoutId);
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(true);
                } else if (message.status === 'error') {
                    clearTimeout(timeoutId);
                    chrome.runtime.onMessage.removeListener(listener);
                    resolve(false);
                }
            }
        };

        chrome.runtime.onMessage.addListener(listener);
    });
}

/**
 * Helper to get the latest server update from storage
 * @param task_id The task ID
 * @returns Promise with the latest update result
 */
export async function getLatestUpdateResult(task_id: string): Promise<{
    success: boolean;
    data?: {
        result?: {
            actions?: Action[];
            is_done?: boolean;
        };
    };
    error?: string;
}> {
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