import { collectDOMData } from "../utils/dom";
import { createTask, updateTaskAndGetPlan } from "../utils/api";
import { executeAction } from "./action-executor";
import type { Message } from "../types/ui";
import type { Dispatch, SetStateAction } from "react";

type SetMessages = Dispatch<SetStateAction<Message[]>>;

interface PlannedActionResponse {
	status?: string;
	task_id?: string;
	planned_action?: {
		action: string;
		parameters?: any;
	};
	execution_result?: {
		status: "success" | "error";
		message?: string;
		data?: {
			browser_command?: {
				tool: string;
				parameters?: any;
			};
			element?: {
				element_id: number;
				tag: string;
				attributes: Record<string, any>;
				xpath: string;
			};
		};
	};
	[key: string]: unknown;
}

let cancelRequested = false;

export function cancelAgentLoop() {
	cancelRequested = true;
}

function shouldStop(): boolean {
	return cancelRequested === true;
}

export async function runAgentLoop(
	query: string,
	setMessages: SetMessages,
	setIsProcessing: (v: boolean) => void
) {
	cancelRequested = false;
	setIsProcessing(true);
	try {
		const serverUrl = (localStorage.getItem("serverUrl") || "http://localhost:8000").replace(/\/$/, "");

		// Initial setup with better error handling
		console.log("[AGENT-LOOP] Starting agent loop with query:", query);
		
		const { activeTab, openTabsWithIds } = await getCurrentTabsInfo();
		if (!activeTab?.id) {
			throw new Error("No active tab found to work with");
		}

		console.log(`[AGENT-LOOP] Working with active tab: ${activeTab.id} - ${activeTab.url}`);

		if (shouldStop()) {
			setMessages((prev) => [...prev, { type: "agent", text: "⏹️ Stopped." }]);
			return;
		}

		const { task_id, chain_of_thought = null } = await createTask(
			serverUrl,
			query,
			activeTab?.url || "",
			openTabsWithIds,
			`${activeTab?.id ?? ""}`
		);

		setMessages((prev) => [
			...prev,
			{ type: "agent", text: `🆕 Task created with ID: ${task_id}` },
			...(chain_of_thought ? [{ type: "cot", cot: chain_of_thought }] as Message[] : []),
			{ type: "agent", text: `🚀 Starting automation workflow...` },
		]);

		let iteration = 0;
		const maxIterations = 25;
		let done = false;

		while (!done && iteration < maxIterations) {
			if (shouldStop()) {
				setMessages((prev) => [...prev, { type: "agent", text: "⏹️ Stopped." }]);
				break;
			}

			console.log(`[AGENT-LOOP] ==> Starting iteration ${iteration}`);

			// STEP 1: Ensure page is ready and collect current state
			setMessages((prev) => [...prev, { type: "agent", text: `🔍 Step ${iteration + 1}: Analyzing current page...` }]);
			
			let currentTabState;
			let currentDom;
			
			try {
				// Wait for page to be fully ready before doing anything
				await ensurePageIsReady(setMessages);
				
				// Get current tab state
				currentTabState = await getCurrentTabsInfo();
				if (!currentTabState.activeTab?.id) {
					setMessages((prev) => [...prev, { type: "agent", text: "❌ No active tab found. Stopping." }]);
					break;
				}

				console.log(`[AGENT-LOOP] Current tab: ${currentTabState.activeTab.id} - ${currentTabState.activeTab.url}`);

				// Collect fresh DOM from current page
				currentDom = await collectDOMDataWithRetry();
				console.log(`[AGENT-LOOP] DOM collected successfully for iteration ${iteration}`);
				
			} catch (error: any) {
				setMessages((prev) => [...prev, { type: "agent", text: `❌ Failed to analyze page: ${error.message}. Stopping.` }]);
				break;
			}

			// STEP 2: Send DOM to backend and get plan
			setMessages((prev) => [...prev, { type: "agent", text: `🧠 Getting plan from AI...` }]);
			
			let turn: PlannedActionResponse;
			try {
				turn = await updateTaskAndGetPlan(serverUrl, {
					task_id,
					dom_data: currentDom,
					iterationNumber: iteration,
					openTabsWithIds: currentTabState.openTabsWithIds,
					currentTab: { id: currentTabState.activeTab.id, url: currentTabState.activeTab.url },
				});

				if (iteration === 0) {
					setMessages((prev) => [...prev, { type: "agent", text: `✅ Plan received for current page.` }]);
				}
			} catch (error: any) {
				setMessages((prev) => [...prev, { type: "agent", text: `❌ Failed to get plan from backend: ${error.message}. Stopping.` }]);
				break;
			}

			if (shouldStop()) {
				setMessages((prev) => [...prev, { type: "agent", text: "⏹️ Stopped." }]);
				break;
			}

			// STEP 3: Process the planned action
			const planned = turn?.execution_result?.data?.browser_command || turn?.planned_action;

			if (!planned) {
				setMessages((prev) => [...prev, { type: "agent", text: `⚠️ No action planned for this step. Stopping.` }]);
				break;
			}

			// Enrich action with element data if available
			const fullElementData = turn.execution_result?.data?.element;
			if (fullElementData && planned.parameters?.element_id === fullElementData.element_id) {
				console.log(`[AGENT-LOOP] Enriching action with element data for iteration ${iteration}`);
				planned.parameters.xpath = fullElementData.xpath;
				planned.parameters.data_navigator_id = fullElementData.attributes['data-navigator-id'];
			}

			const action = normalizeAction(planned);

			// Check for completion
			if (action.type === "TASK_COMPLETE" || action.type === "TASK_FAILED") {
				done = true;
				setMessages((prev) => [...prev, { type: "agent", text: action.type === "TASK_COMPLETE" ? `🎉 Task completed successfully!` : `❌ Task failed: ${action.message || "unknown error"}` }]);
				break;
			}

			// STEP 4: Execute the action
			setMessages((prev) => [...prev, { type: "agent", text: describeAction(action) }]);

			// New: recovery loop that re-collects DOM and re-plans up to 4 times on failures
			const MAX_RECOVERY_ATTEMPTS = 4;
			let recoveryAttempt = 0;
			let execResult: any = { success: false, message: "" };
			let nextAction = action;

			while (recoveryAttempt <= MAX_RECOVERY_ATTEMPTS) {
				if (shouldStop()) {
					setMessages((prev) => [...prev, { type: "agent", text: "⏹️ Stopped." }]);
					break;
				}

				// Execute current planned action
				execResult = await executeActionSafely(currentTabState.activeTab.id, nextAction, iteration, setMessages);
				console.log(`[AGENT-LOOP] Action result:`, execResult);

				if (execResult.success === true) {
					break; // success for this iteration
				}

				if (recoveryAttempt === MAX_RECOVERY_ATTEMPTS) {
					// Out of retries
					break;
				}

				// Re-analyze the page and re-plan
				setMessages((prev) => [...prev, { type: "agent", text: `🔁 Action failed: ${execResult.message || "unknown"}. Re-analyzing page (attempt ${recoveryAttempt + 1}/${MAX_RECOVERY_ATTEMPTS})...` }]);

				try {
					await waitForPageStabilization(800);
					await ensurePageIsReady(setMessages);

					// Refresh tab state
					currentTabState = await getCurrentTabsInfo();
					if (!currentTabState.activeTab?.id) {
						setMessages((prev) => [...prev, { type: "agent", text: "❌ No active tab found after failure. Stopping." }]);
						break;
					}

					// Collect fresh DOM and get a new plan
					currentDom = await collectDOMDataWithRetry();
					const newTurn: PlannedActionResponse = await updateTaskAndGetPlan(serverUrl, {
						task_id,
						dom_data: currentDom,
						iterationNumber: iteration,
						openTabsWithIds: currentTabState.openTabsWithIds,
						currentTab: { id: currentTabState.activeTab.id, url: currentTabState.activeTab.url },
					});

					const newPlanned = newTurn?.execution_result?.data?.browser_command || newTurn?.planned_action;
					if (!newPlanned) {
						setMessages((prev) => [...prev, { type: "agent", text: `⚠️ No new action suggested during recovery. Stopping.` }]);
						break;
					}

					// Enrich with element data if present
					const newElementData = newTurn.execution_result?.data?.element;
					if (newElementData && newPlanned.parameters?.element_id === newElementData.element_id) {
						console.log(`[AGENT-LOOP] Recovery enricher: updating action target`);
						newPlanned.parameters.xpath = newElementData.xpath;
						newPlanned.parameters.data_navigator_id = newElementData.attributes['data-navigator-id'];
					}

					nextAction = normalizeAction(newPlanned);
					setMessages((prev) => [...prev, { type: "agent", text: `🧭 Recovery attempt ${recoveryAttempt + 1}: ${describeAction(nextAction)}` }]);

				} catch (recoveryError: any) {
					setMessages((prev) => [...prev, { type: "agent", text: `❌ Recovery failed: ${recoveryError.message}. Stopping.` }]);
					break;
				}

				recoveryAttempt += 1;
			}

			if (execResult.success !== true) {
				setMessages((prev) => [...prev, { type: "agent", text: `❌ Action failed after ${recoveryAttempt} recovery attempt(s): ${execResult.message || "unknown error"}` }]);
				break;
			}

			if (execResult.success && execResult.message?.includes("Navigation detected during action")) {
				setMessages((prev) => [...prev, { type: "agent", text: `↪️ Navigation occurred. Assessing new page...` }]);
			}

			// STEP 5: Wait for page to stabilize
			setMessages((prev) => [...prev, { type: "agent", text: `✅ Action completed. Waiting for page to stabilize...` }]);
			await waitForPageStabilization(2000); // Give extra time for page transitions

			iteration += 1;
		}

		if (iteration >= maxIterations) {
			setMessages((prev) => [...prev, { type: "agent", text: `⚠️ Reached maximum iterations (${maxIterations}). Stopping.` }]);
		}

	} catch (err: any) {
		console.error("[AGENT-LOOP] Error:", err);
		setMessages((prev) => [...prev, { type: "agent", text: `❌ ${err?.message || "Unexpected error occurred"}` }]);
	} finally {
		setIsProcessing(false);
		cancelRequested = false; // Reset for next run
	}
}

async function getCurrentTabsInfo(): Promise<{
	activeTab: chrome.tabs.Tab | null;
	openTabsWithIds: string[];
}> {
	try {
		const currentTabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
		const activeTab = currentTabs.find(t => t.active) || currentTabs[0] || null;
		const openTabsWithIds = currentTabs.map(tab => 
			`Tab id: ${tab.id} - URL: ${tab.url} - Title: ${tab.title}`
		);
		
		return { activeTab, openTabsWithIds };
	} catch (error: any) {
		console.error("[AGENT-LOOP] Failed to get tab info:", error);
		throw new Error(`Failed to get browser tab information: ${error.message}`);
	}
}

async function ensurePageIsReady(setMessages: SetMessages): Promise<void> {
	const maxWaitTime = 12000; // 12 seconds max
	const startTime = Date.now();
	
	console.log(`[AGENT-LOOP] Ensuring page is ready...`);
	
	while (Date.now() - startTime < maxWaitTime) {
		try {
			const { activeTab } = await getCurrentTabsInfo();
			if (!activeTab?.id) {
				throw new Error("No active tab found");
			}
			
			const tab = await chrome.tabs.get(activeTab.id);
			
			if (tab && tab.status === "complete" && tab.url && !tab.url.includes("about:blank")) {
				console.log(`[AGENT-LOOP] Page is ready: ${tab.url}`);
				// Extra small delay to ensure page is truly stable
				await new Promise(resolve => setTimeout(resolve, 500));
				return;
			}
			
			console.log(`[AGENT-LOOP] Waiting for page... Status: ${tab?.status}, URL: ${tab?.url}`);
			await new Promise(resolve => setTimeout(resolve, 200));
		} catch (error: any) {
			console.warn(`[AGENT-LOOP] Error checking page readiness:`, error);
			await new Promise(resolve => setTimeout(resolve, 300));
		}
	}
	
	console.warn(`[AGENT-LOOP] Page readiness timeout after ${maxWaitTime}ms, proceeding anyway`);
}

async function executeActionSafely(
	tabId: number,
	action: any,
	iteration: number,
	setMessages: SetMessages
): Promise<any> {
	const maxRetries = 2; // Reduced retries since we have better page detection
	let lastError: any = null;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`[AGENT-LOOP] Executing action (attempt ${attempt}/${maxRetries}): ${action.type}`);
			
			// Verify tab still exists
			const tab = await chrome.tabs.get(tabId);
			if (!tab || tab.status !== "complete") {
				throw new Error(`Tab ${tabId} is not ready (status: ${tab?.status})`);
			}
			
			const result = await executeAction(tabId, action, action.frame_id);
			console.log(`[AGENT-LOOP] Action result:`, result);
			
			if (result.success) {
				if (result.success && result.message?.includes("Navigation detected during action")) {
					setMessages((prev) => [...prev, { type: "agent", text: `↪️ Navigation occurred. Assessing new page...` }]);
				}
				return result;
			} else {
				throw new Error(result.message || "Action execution failed");
			}
		} catch (error: any) {
			lastError = error;
			const errorMessage = error.message || String(error);
			console.warn(`[AGENT-LOOP] Action attempt ${attempt} failed: ${errorMessage}`);
			
			if (attempt < maxRetries) {
				setMessages((prev) => [...prev, { type: "agent", text: `⚠️ Retrying action (${errorMessage})...` }]);
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}

	// All attempts failed
	const errorMessage = lastError?.message || String(lastError);
	console.error(`[AGENT-LOOP] Action failed after ${maxRetries} attempts:`, lastError);
	return { success: false, message: `Action failed: ${errorMessage}` };
}

async function waitForPageStabilization(ms: number): Promise<void> {
	console.log(`[AGENT-LOOP] Waiting ${ms}ms for page stabilization...`);
	await new Promise(resolve => setTimeout(resolve, ms));
}

async function collectDOMDataWithRetry(maxRetries: number = 2): Promise<any> {
	let lastError: any = null;
	
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			console.log(`[AGENT-LOOP] Collecting DOM data attempt ${attempt}/${maxRetries}`);
			
			// Get current active tab to ensure we're collecting from the right place
			const { activeTab } = await getCurrentTabsInfo();
			if (!activeTab?.id) {
				throw new Error("No active tab available for DOM collection");
			}
			
			console.log(`[AGENT-LOOP] Collecting DOM from tab ${activeTab.id}: ${activeTab.url}`);
			
			const domData = await collectDOMData();
			console.log(`[AGENT-LOOP] DOM collection successful`);
			
			return domData;
		} catch (error: any) {
			lastError = error;
			console.warn(`[AGENT-LOOP] DOM collection attempt ${attempt} failed:`, error);
			
			if (attempt < maxRetries) {
				console.log(`[AGENT-LOOP] Retrying DOM collection in ${500 * attempt}ms...`);
				await new Promise(resolve => setTimeout(resolve, 500 * attempt));
			}
		}
	}
	
	console.error(`[AGENT-LOOP] All DOM collection attempts failed:`, lastError);
	throw lastError;
}

function normalizeAction(input: any): any {
	const tool = input?.tool || input?.action;
	const parameters = input?.parameters || {};
	const mapping: Record<string, string> = {
		CLICK: "CLICK", click: "CLICK",
		TYPE: "TYPE", input: "TYPE", type: "TYPE",
		SCROLL: "SCROLL", scroll: "SCROLL",
		NAVIGATE: "NAVIGATE", url: "NAVIGATE", navigate: "NAVIGATE", navigate_to: "NAVIGATE", navigate_url: "NAVIGATE",
		select_option: "select_option", SELECT_OPTION: "select_option", selectOption: "select_option",
		hover: "hover", HOVER: "hover",
		go_back: "go_back", GO_BACK: "go_back", back: "go_back",
		go_forward: "go_forward", GO_FORWARD: "go_forward", forward: "go_forward",
		refresh_page: "refresh_page", REFRESH_PAGE: "refresh_page", reload: "refresh_page", refresh: "refresh_page",
		TASK_COMPLETE: "TASK_COMPLETE",
		TASK_FAILED: "TASK_FAILED",
	};
	return {
		type: mapping[tool] || tool,
		...parameters,
	};
}

function describeAction(action: any): string {
	switch (action.type) {
		case "CLICK": return `🖱️ Clicking ${describeTarget(action)}`;
		case "TYPE": return `⌨️ Typing "${truncate(action.text || "", 60)}" into ${describeTarget(action)}`;
		case "SCROLL": return `📜 Scrolling ${action.direction || "down"}`;
		case "NAVIGATE": return `🌐 Navigating to ${action.url || "(missing url)"}`;
		case "select_option": return `🔽 Selecting "${truncate(action.value || "", 60)}" in ${describeTarget(action)}`;
		case "hover": return `🖱️ Hovering over ${describeTarget(action)}`;
		case "go_back": return `⬅️ Going back in browser history`;
		case "go_forward": return `➡️ Going forward in browser history`;
		case "refresh_page": return `🔄 Refreshing current page`;
		case "open_new_tab": return `🆕 Opening new tab${action.url ? ` to ${action.url}` : ""}`;
		case "switch_to_tab": return `🔁 Switching to tab ${action.tab_id ?? "(unspecified)"}`;
		case "close_current_tab": return `🗑️ Closing tab ${action.tab_id ?? "(current)"}`;
		default: return `🔧 Executing ${action.type}`;
	}
}

function describeTarget(action: any): string {
	if (action.data_navigator_id) return `with data-navigator-id '${action.data_navigator_id}'`;
	if (action.xpath) return `with xpath '${action.xpath}'`;
	if (action.selector) return `with selector '${action.selector}'`;
	if (action.element_id) return `with internal id '${action.element_id}'`;
	return "(unspecified target)";
}

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
