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
	planned_actions?: Array<{
		action: string;
		parameters?: any;
	}>;
	planned_actions_elements?: Array<{
		index: number;
		element_id: number;
		tag?: string;
		xpath?: string;
		attributes?: Record<string, any>;
	}>;
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
		let lastIterationResult: any = null;

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
					iteration_result: lastIterationResult || undefined,
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

			// STEP 3: Process planned actions (support multiple)
			const rawPlannedList: any[] = Array.isArray(turn?.planned_actions)
				? (turn!.planned_actions as any[])
				: [turn?.execution_result?.data?.browser_command || turn?.planned_action].filter(Boolean) as any[];

			if (!rawPlannedList.length) {
				setMessages((prev) => [...prev, { type: "agent", text: `⚠️ No actions planned for this step. Stopping.` }]);
				break;
			}

			// Enrich planned actions with element details from server (by index or element_id)
			try {
				const plannedElements = Array.isArray((turn as any).planned_actions_elements) ? (turn as any).planned_actions_elements as any[] : [];
				const byIndex = new Map<number, any>();
				const byElementId = new Map<number, any>();
				for (const el of plannedElements) {
					if (typeof el?.index === 'number') byIndex.set(el.index, el);
					if (typeof el?.element_id === 'number') byElementId.set(el.element_id, el);
				}
				for (let i = 0; i < rawPlannedList.length; i++) {
					const pl = rawPlannedList[i] || {};
					pl.parameters = pl.parameters || {};
					const elIdx = byIndex.get(i);
					const elById = byElementId.get(pl.parameters.element_id);
					const el = elIdx || elById;
					if (el) {
						if (el.xpath && !pl.parameters.xpath) pl.parameters.xpath = el.xpath;
						const navId = el.attributes?.['data-navigator-id'];
						if (navId && !pl.parameters.data_navigator_id) pl.parameters.data_navigator_id = navId;
					}
				}
				// Also keep backward compat enrichment for first action if provided separately
				const fullElementData = turn.execution_result?.data?.element;
				if (fullElementData && rawPlannedList[0]?.parameters?.element_id === fullElementData.element_id) {
					rawPlannedList[0].parameters.xpath = rawPlannedList[0].parameters.xpath || fullElementData.xpath;
					rawPlannedList[0].parameters.data_navigator_id = rawPlannedList[0].parameters.data_navigator_id || fullElementData.attributes['data-navigator-id'];
				}
			} catch (e) {
				console.warn('[AGENT-LOOP] Failed enriching planned actions with element details', e);
			}

			const normalizedActions = rawPlannedList.map(pl => normalizeAction(pl));

			// Check for immediate control actions
			if (normalizedActions.length === 1 && (normalizedActions[0].type === "TASK_COMPLETE" || normalizedActions[0].type === "TASK_FAILED")) {
				done = true;
				setMessages((prev) => [...prev, { type: "agent", text: normalizedActions[0].type === "TASK_COMPLETE" ? `🎉 Task completed successfully!` : `❌ Task failed: ${normalizedActions[0].message || "unknown error"}` }]);
				break;
			}

			// STEP 4: Execute the actions sequentially with per-action retries
			setMessages((prev) => [...prev, { type: "agent", text: `🔧 Executing ${normalizedActions.length} action(s) for this step...` }]);
			const batchResults: Array<{ index: number; action: any; success: boolean; message?: string; attempts: number; navigationDetected: boolean }> = [];
			let anySuccess = false;
			let navigationDetected = false;

			for (let i = 0; i < normalizedActions.length; i++) {
				if (shouldStop()) {
					setMessages((prev) => [...prev, { type: "agent", text: "⏹️ Stopped." }]);
					break;
				}
				const nextAction = normalizedActions[i];
				setMessages((prev) => [...prev, { type: "agent", text: describeAction(nextAction) }]);
				const result = await executeActionSafely(currentTabState.activeTab.id, nextAction, iteration, setMessages);
				console.log(`[AGENT-LOOP] Action ${i + 1}/${normalizedActions.length} result:`, result);
				anySuccess = anySuccess || result.success === true;
				navigationDetected = navigationDetected || (result.message?.includes("Navigation detected during action") ?? false);
				batchResults.push({ index: i, action: nextAction, success: !!result.success, message: result.message, attempts: result.attempts ?? 1, navigationDetected });

				if (result.success !== true) {
					// Action failed after retries; continue to next action in the batch
					setMessages((prev) => [...prev, { type: "agent", text: `⚠️ Action ${i + 1} failed: ${result.message || "unknown"}` }]);
				} else if (navigationDetected) {
					// Stop executing further planned actions on navigation; we'll re-assess on next iteration
					setMessages((prev) => [...prev, { type: "agent", text: `↪️ Navigation occurred. Stopping remaining actions in this batch.` }]);
					break;
				}
			}

			// Fallback if none succeeded: try going back
			let fallbackPerformed: string | null = null;
			if (!anySuccess) {
				setMessages((prev) => [...prev, { type: "agent", text: `🛑 All actions in this batch failed. Attempting fallback (go back)...` }]);
				try {
					const fb = await executeActionSafely(currentTabState.activeTab.id, { type: "go_back" }, iteration, setMessages);
					if (fb.success) {
						fallbackPerformed = "go_back";
						setMessages((prev) => [...prev, { type: "agent", text: `⬅️ Went back in history to recover.` }]);
					} else {
						setMessages((prev) => [...prev, { type: "agent", text: `⚠️ Fallback go back failed: ${fb.message || "unknown"}. Trying refresh...` }]);
						const rf = await executeActionSafely(currentTabState.activeTab.id, { type: "refresh_page" }, iteration, setMessages);
						if (rf.success) {
							fallbackPerformed = "refresh_page";
							setMessages((prev) => [...prev, { type: "agent", text: `🔄 Page refreshed.` }]);
						}
					}
				} catch (fbErr: any) {
					console.warn(`[AGENT-LOOP] Fallback failed:`, fbErr);
				}
			}

			// STEP 5: clear dom with navigator specific elements and wait for page to stabilize
			await clearDebuggingElements();
			setMessages((prev) => [...prev, { type: "agent", text: `✅ Step completed. Waiting for page to stabilize...` }]);
			await waitForPageStabilization(2000);

			// Prepare iteration result for the next update call
			lastIterationResult = {
				iteration_index: iteration,
				planned_raw: rawPlannedList,
				planned: normalizedActions,
				results: batchResults,
				summary: {
					any_success: anySuccess,
					success_count: batchResults.filter(r => r.success).length,
					failure_count: batchResults.filter(r => !r.success).length,
					navigation_detected: navigationDetected,
					fallback_performed: fallbackPerformed,
				},
			};

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
		TASK_COMPLETE: "TASK_COMPLETE", task_complete: "TASK_COMPLETE",
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

async function clearDebuggingElements(): Promise<void> {
	document.querySelectorAll('[data-navigator-id]').forEach(el => {
		(el as HTMLElement).style.border = '';
		el.removeAttribute('data-navigator-id');
	});
}