type ExecutionResult = { success: boolean; message?: string };

type ActionInput = {
	type: "CLICK" | "TYPE" | "SCROLL" | "NAVIGATE" | "TASK_COMPLETE" | "TASK_FAILED" | string;
	selector?: string;
	xpath?: string;
	element_id?: string;
    data_navigator_id?: string;
	text?: string;
	direction?: "up" | "down" | "top" | "bottom";
	url?: string;
  	tab_id?: number;
    frame_id?: number;
    key?: string;
    value?: string;
};

// --- Navigation state & listeners ---
const navigationStateByTab: Map<number, { lastCommitted?: number; lastCompleted?: number; lastDOMContentLoaded?: number }> = new Map();
let webNavigationListenersInstalled = false;

function installWebNavigationListenersOnce() {
	if (webNavigationListenersInstalled) return;
	webNavigationListenersInstalled = true;
	try {
		chrome.webNavigation.onCommitted.addListener((details) => {
			if (details.frameId === 0) {
				const s = navigationStateByTab.get(details.tabId) || {};
				s.lastCommitted = Date.now();
				navigationStateByTab.set(details.tabId, s);
			}
		});
		chrome.webNavigation.onDOMContentLoaded.addListener((details) => {
			if (details.frameId === 0) {
				const s = navigationStateByTab.get(details.tabId) || {};
				s.lastDOMContentLoaded = Date.now();
				navigationStateByTab.set(details.tabId, s);
			}
		});
		chrome.webNavigation.onCompleted.addListener((details) => {
			if (details.frameId === 0) {
				const s = navigationStateByTab.get(details.tabId) || {};
				s.lastCompleted = Date.now();
				navigationStateByTab.set(details.tabId, s);
			}
		});
	} catch (err) {
		console.warn("[ORCHESTRATOR] Failed to install webNavigation listeners", err);
	}
}

function hasNavigationSince(tabId: number, sinceMs: number): boolean {
	const s = navigationStateByTab.get(tabId);
	if (!s) return false;
	return (
		(s.lastCommitted ?? 0) > sinceMs ||
		(s.lastDOMContentLoaded ?? 0) > sinceMs ||
		(s.lastCompleted ?? 0) > sinceMs
	);
}

async function waitForNavigationSince(tabId: number, sinceMs: number, timeoutMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (hasNavigationSince(tabId, sinceMs)) {
			return true;
		}
		await new Promise((r) => setTimeout(r, 100));
	}
	return false;
}

/**
 * Executes a given browser action in the specified tab.
 * All actions are treated as potentially causing page changes, so the caller
 * should always re-assess the page state after execution.
 *
 * @param tabId - The ID of the tab to perform the action in.
 * @param action - The action to be performed.
 * @param frameId - The optional ID of the frame to perform the action in.
 * @returns A promise that resolves with the execution result.
 */
export async function executeAction(
    tabId: number,
    action: ActionInput,
    frameId?: number
): Promise<ExecutionResult> {
	installWebNavigationListenersOnce();
	console.log(`[ORCHESTRATOR] Received action: ${action.type}`, { action, tabId, frameId });

	// Validate tab exists and is ready
	try {
		const tab = await chrome.tabs.get(tabId);
		if (!tab) {
			throw new Error(`Tab ${tabId} not found`);
		}
		console.log(`[ORCHESTRATOR] Tab validation passed: ${tab.url}`);
	} catch (error: any) {
		console.error(`[ORCHESTRATOR] Tab validation failed:`, error);
		return { success: false, message: `Tab not found: ${error.message}` };
	}

	// --- Handle non-page actions first ---
	if (action.type === "TASK_COMPLETE" || action.type === "TASK_FAILED") {
		return { success: true };
	}
	if (action.type === "NAVIGATE") {
		if (!action.url) return { success: false, message: "NAVIGATE action requires a url parameter." };
		await chrome.tabs.update(tabId, { url: action.url });
		return { success: true };
	}
	if (action.type === "go_back") {
		await chrome.tabs.goBack(tabId);
		return { success: true };
	}
	if (action.type === "go_forward") {
		await chrome.tabs.goForward(tabId);
		return { success: true };
	}
	if (action.type === "refresh_page") {
		await chrome.tabs.reload(tabId);
		return { success: true };
	}
    if (action.type === "open_new_tab") {
        await chrome.tabs.create({ url: action.url || undefined });
        return { success: true };
    }
    if (action.type === "switch_to_tab") {
        if (typeof action.tab_id !== "number") {
            return { success: false, message: "switch_to_tab requires tab_id" };
        }
        await chrome.tabs.update(action.tab_id, { active: true });
        return { success: true };
    }
    if (action.type === "close_current_tab") {
        const targetTabId = typeof action.tab_id === "number" ? action.tab_id : tabId;
        await chrome.tabs.remove(targetTabId);
        return { success: true };
    }

	// --- Handle actions that interact with the page content ---
	return await executePageAction(tabId, action, frameId);
}

async function executePageAction(
    tabId: number,
    action: ActionInput,
    frameId?: number
): Promise<ExecutionResult> {
	const maxRetries = 3;
	let lastError: any = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`[ORCHESTRATOR] Attempt ${attempt}/${maxRetries} for action: ${action.type}`);
			
			const target: chrome.scripting.InjectionTarget = { tabId };
			if (frameId !== undefined) {
				// @ts-ignore - frameIds is valid but might not be in all TS lib versions
				target.frameIds = [frameId];
			}

			// Wait for tab to be ready and stable
			await waitForTabReady(tabId, attempt);

			const tab = await chrome.tabs.get(tabId);
			
			// Check if page supports script injection
			if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://') || tab.url?.startsWith('edge://') || tab.url?.startsWith('about:')) {
				throw new Error(`Cannot inject scripts into protected page: ${tab.url}`);
			}

			console.log(`[ORCHESTRATOR] Injecting automation agent into tab ${tabId}...`);

			// Inject the agent script
			await chrome.scripting.executeScript({
				target: target,
				files: ['agent/automation-agent.js'],
			});
			console.log(`[ORCHESTRATOR] Agent script injected successfully`);

			// Wait for agent initialization
			await new Promise(resolve => setTimeout(resolve, 200));

			// Execute the action with navigation/timeout race
			console.log(`[ORCHESTRATOR] Executing action on injected agent...`);
			const actionStartMs = Date.now();
			const initialUrl = tab.url || "";
			const execPromise = chrome.scripting.executeScript({
				target: target,
				world: "ISOLATED",
				args: [action],
				func: (actionToDo: ActionInput) => {
					if (!window.navigatorAgent) {
						return { success: false, message: "Agent not available on page" };
					}
					try {
						return window.navigatorAgent.execute(actionToDo);
					} catch (err: any) {
						return { success: false, message: `Agent execution error: ${err.message || err}` };
					}
				},
			});

			const ACTION_RESULT_TIMEOUT_MS = 6000;
			type RaceOutcome = { kind: 'result'; res: any[] } | { kind: 'nav' } | { kind: 'timeout' } | { kind: 'no-nav' };
			const raceResult: RaceOutcome = await Promise.race([
				execPromise.then((res) => ({ kind: 'result', res }) as RaceOutcome),
				waitForNavigationSince(tabId, actionStartMs, ACTION_RESULT_TIMEOUT_MS).then((nav) => (nav ? ({ kind: 'nav' } as RaceOutcome) : ({ kind: 'no-nav' } as RaceOutcome))),
				new Promise<RaceOutcome>((resolve) => setTimeout(() => resolve({ kind: 'timeout' }), ACTION_RESULT_TIMEOUT_MS)),
			]);

			if (raceResult.kind === 'nav' || raceResult.kind === 'timeout') {
				console.log(`[ORCHESTRATOR] ${raceResult.kind === 'nav' ? 'Navigation detected' : 'Action timeout'} during execution. Treating as success.`);
				return { success: true, message: "Navigation detected during action" };
			}

			if (raceResult.kind !== 'result') {
				// No navigation and no result within timeout shouldn't happen due to branches above, but guard anyway
				throw new Error("Unexpected race outcome without result");
			}

			const [injectionResult] = raceResult.res;

			if (!injectionResult?.result) {
				throw new Error("Script execution returned no result");
			}

			const result = injectionResult.result as ExecutionResult;
			console.log("[ORCHESTRATOR] Action executed successfully:", result);

			// If result is failure but URL changed since action start, treat as navigation success
			try {
				const afterTab = await chrome.tabs.get(tabId);
				const afterUrl = afterTab.url || "";
				if (result.success === false && afterUrl && afterUrl !== initialUrl) {
					console.log(`[ORCHESTRATOR] URL changed from '${initialUrl}' to '${afterUrl}' while action reported failure. Treating as navigation success.`);
					return { success: true, message: "Navigation detected during action" };
				}
			} catch {}

			return result;

		} catch (error: any) {
			lastError = error;
			const errorMessage = error.message || String(error);
			console.warn(`[ORCHESTRATOR] Attempt ${attempt} failed: ${errorMessage}`);

			if (isNavigationRelatedError(errorMessage)) {
				console.log("[ORCHESTRATOR] Navigation detected during action. Treating as success.");
				return { success: true, message: "Navigation detected during action" };
			}

			// Check for recoverable errors
			if (isRecoverableError(errorMessage) && attempt < maxRetries) {
				console.log(`[ORCHESTRATOR] Recoverable error, retrying in ${500 * attempt}ms...`);
				await new Promise(resolve => setTimeout(resolve, 500 * attempt));
				continue;
			}

			// If this is the last attempt or an unrecoverable error, break
			break;
		}
	}

	// All attempts failed
	const errorMessage = lastError?.message || String(lastError);
	console.error("[ORCHESTRATOR] All attempts failed. Final error:", lastError);
	return { success: false, message: `Action failed after ${maxRetries} attempts: ${errorMessage}` };
}

async function waitForTabReady(tabId: number, attempt: number): Promise<void> {
	const maxWaitTime = 10000; // Increased to 10 seconds for slower page transitions
	const startTime = Date.now();
	
	console.log(`[ORCHESTRATOR] Waiting for tab ${tabId} to be ready (attempt ${attempt})...`);
	
	while (Date.now() - startTime < maxWaitTime) {
		try {
			const tab = await chrome.tabs.get(tabId);
			
			if (tab && tab.status === "complete" && tab.url && !tab.url.includes("about:blank")) {
				console.log(`[ORCHESTRATOR] Tab ${tabId} is ready: ${tab.url}`);
				// Additional delay to ensure page is truly stable after status=complete
				await new Promise(resolve => setTimeout(resolve, 400));
				return;
			}
			
			console.log(`[ORCHESTRATOR] Tab ${tabId} not ready yet - Status: ${tab?.status}, URL: ${tab?.url}`);
			await new Promise(resolve => setTimeout(resolve, 300));
		} catch (error) {
			console.warn(`[ORCHESTRATOR] Error checking tab readiness:`, error);
			if (attempt === 1) {
				// Only throw on first attempt - other attempts might be due to navigation
				throw error;
			}
			await new Promise(resolve => setTimeout(resolve, 300));
		}
	}
	
	console.warn(`[ORCHESTRATOR] Tab ${tabId} readiness timeout after ${maxWaitTime}ms, proceeding anyway`);
}

function isRecoverableError(errorMessage: string): boolean {
	const recoverableIndicators = [
		"tab not found",
		"no tab with id", 
		"tab is loading",
		"tab closed",
		"cannot access a chrome",
		"timeout",
		"frame with id",
		"was removed",
		"no frame with id",
		"target frame detached",
		"frame was detached",
		"cannot access contents of url",
		"script execution failed"
	];
	
	return recoverableIndicators.some(indicator => 
		errorMessage.toLowerCase().includes(indicator.toLowerCase())
	);
}

function isNavigationRelatedError(errorMessage: string): boolean {
  const navigationIndicators = [
    "Frame with ID",
    "was removed",
    "No frame with id",
    "target frame detached",
    "frame was detached",
    "Cannot access contents of url",
    "The extensions gallery cannot be scripted",
    "Script execution failed",
    "Execution context was destroyed"
  ];
  return navigationIndicators.some(indicator => 
    errorMessage.toLowerCase().includes(indicator.toLowerCase())
  );
}

declare global {
    interface Window {
        navigatorAgent: {
            execute(action: any): Promise<{success: boolean, message?: string}>;
        };
    }
}
