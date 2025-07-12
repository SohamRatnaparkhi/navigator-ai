import { Action, IAutomationHandler, initAutomationHandler, ExecuteActionResult } from '@navigator-ai/core';

let automationHandler: IAutomationHandler;
try {
    automationHandler = initAutomationHandler();
    
    if (typeof automationHandler.setDebugMode === 'function') {
        automationHandler.setDebugMode(true);
    }
} catch (error) {
    console.error('Error creating AutomationHandler:', error);
    // automationHandler = {
    //     setDebugMode: () => {},
    //     setCursorSize: () => {},
    //     ensureCursorVisible: () => {},
    //     executeAction: async () => {},
    //     executeActions: async () => []
    // };
}

export async function handleAutomationActions(actions: Action[]): Promise<ExecuteActionResult[]> {
    try {
        console.log('=== STARTING ACTION EXECUTION ===');
        console.log('Received actions:', JSON.stringify(actions, null, 2));
        
        if (!Array.isArray(actions) || actions.length === 0) {
            console.error('Invalid actions array:', actions);
            throw new Error('Invalid actions array');
        }
        
        if (!automationHandler) {
            console.error('AutomationHandler is not initialized');
            throw new Error('AutomationHandler not available');
        }
        
        try {
            if (typeof automationHandler.ensureCursorVisible === 'function') {
                automationHandler.ensureCursorVisible();
                console.log('Cursor visibility ensured');
            }
        } catch (initError) {
            console.error('Error initializing cursor:', initError);
        }
        
        console.log('About to execute actions with automationHandler...');
        
        // Create a timeout promise that rejects after 120 seconds
        const timeoutPromise = new Promise<ExecuteActionResult[]>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Action execution timed out after 120 seconds'));
            }, 120000); 
        });
        
        // Execute the actions with a timeout
        const results = await Promise.race([
            automationHandler.executeActions(actions),
            timeoutPromise
        ]);
        
        console.log('=== ACTION EXECUTION COMPLETE ===');
        console.log('Results:', JSON.stringify(results, null, 2));
        
        if (results.some(result => !result.success)) {
            const failedIndex = results.findIndex(result => !result.success);
            console.warn(`Action at index ${failedIndex} failed:`, actions[failedIndex]);
            console.warn(`Failure reason:`, results[failedIndex].message);
        }
        
        return results;
    } catch (error) {
        console.error('=== ACTION EXECUTION ERROR ===');
        console.error('Error in handleAutomationActions:', error);
        throw error; 
    }
}