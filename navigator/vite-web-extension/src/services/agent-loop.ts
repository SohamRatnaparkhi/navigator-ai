import { collectDOMData } from "../utils/dom";
import { createTask } from "../utils/api";
import { updateTaskAndGetPlan } from "../utils/api";
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

export async function runAgentLoop(
	query: string,
	setMessages: SetMessages,
	setIsProcessing: (v: boolean) => void
) {
	setIsProcessing(true);
	try {
		const serverUrl = (localStorage.getItem("serverUrl") || "http://localhost:8000").replace(/\/$/, "");

		const tabs = await chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT });
		const activeTab = tabs.find((t) => t.active) || tabs[0];
		const openTabsWithIds = tabs.map((tab) => `Tab id: ${tab.id} - URL: ${tab.url} - Title: ${tab.title}`);

		const initialDom = await collectDOMData();
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
			{ type: "agent", text: `🌐 Sending initial DOM snapshot...` },
		]);

		const firstTurn: PlannedActionResponse = await updateTaskAndGetPlan(serverUrl, {
			task_id,
			dom_data: initialDom,
			iterationNumber: 0,
			openTabsWithIds: openTabsWithIds,
			currentTab: activeTab ? { id: activeTab.id, url: activeTab.url } : null,
		});

		setMessages((prev) => [
			...prev,
			{ type: "agent", text: `✅ Initial DOM snapshot sent.` },
		]);

		let iteration = 1;
		const maxIterations = 25;
		let done = false;

		// --- First Turn Execution ---
		{
			const planned = firstTurn?.execution_result?.data?.browser_command || firstTurn?.planned_action;

			if (!planned) {
				setMessages((prev) => [...prev, { type: "agent", text: `ℹ️ No action in first turn. Stopping.` }]);
				done = true;
			} else {
				// ---> ACTION ENRICHMENT START <---
				// This is the new logic to add the full address to the command.
				const fullElementData = firstTurn.execution_result?.data?.element;
				if (fullElementData && planned.parameters?.element_id === fullElementData.element_id) {
					console.log("[Enricher] Found matching element data for first turn. Enriching action...");
					planned.parameters.xpath = fullElementData.xpath;
					planned.parameters.data_navigator_id = fullElementData.attributes['data-navigator-id'];
				}
				// ---> ACTION ENRICHMENT END <---

				const action = normalizeAction(planned);
				if (action.type === "TASK_COMPLETE" || action.type === "TASK_FAILED") {
					done = true;
					setMessages((prev) => [...prev, { type: "agent", text: action.type === "TASK_COMPLETE" ? `🎉 Task complete.` : `❌ Task failed: ${action.message || "unknown error"}` }]);
				} else {
					setMessages((prev) => [...prev, { type: "agent", text: describeAction(action) }]);
					const tabId = activeTab?.id;
					if (!tabId) throw new Error("Missing active tab id");
					
					const execResult = await executeAction(tabId, action, action.frame_id);

					if (execResult.success !== true) {
						setMessages((prev) => [...prev, { type: "agent", text: `⚠️ Action error: ${execResult.message || "unknown"}` }]);
						done = true;
					} else {
						await new Promise((r) => setTimeout(r, 600));
					}
				}
			}
		}

		// --- Main Loop Execution ---
		while (!done && iteration <= maxIterations) {
			const dom = await collectDOMData();
			const turn: PlannedActionResponse = await updateTaskAndGetPlan(serverUrl, {
				task_id,
				dom_data: dom,
				iterationNumber: iteration,
				openTabsWithIds: openTabsWithIds,
				currentTab: activeTab ? { id: activeTab.id, url: activeTab.url } : null,
			});

			const planned = turn?.execution_result?.data?.browser_command || turn?.planned_action;

			if (!planned) {
				setMessages((prev) => [...prev, { type: "agent", text: `⚠️ No action planned on iteration ${iteration}. Stopping.` }]);
				break;
			}

			// ---> ACTION ENRICHMENT START <---
			// We do the same enrichment inside the loop.
			const fullElementData = turn.execution_result?.data?.element;
			if (fullElementData && planned.parameters?.element_id === fullElementData.element_id) {
				console.log(`[Enricher] Found matching element data for turn ${iteration}. Enriching action...`);
				planned.parameters.xpath = fullElementData.xpath;
				planned.parameters.data_navigator_id = fullElementData.attributes['data-navigator-id'];
			}
			// ---> ACTION ENRICHMENT END <---

			const action = normalizeAction(planned);

			if (action.type === "TASK_COMPLETE" || action.type === "TASK_FAILED") {
				done = true;
				setMessages((prev) => [...prev, { type: "agent", text: action.type === "TASK_COMPLETE" ? `🎉 Task complete.` : `❌ Task failed: ${action.message || "unknown error"}` }]);
				break;
			}

			setMessages((prev) => [...prev, { type: "agent", text: describeAction(action) }]);
			const tabId = activeTab?.id;
			if (!tabId) throw new Error("Missing active tab id");

			const execResult = await executeAction(tabId, action, action.frame_id);

			if (execResult.success !== true) {
				setMessages((prev) => [...prev, { type: "agent", text: `⚠️ Action error: ${execResult.message || "unknown"}` }]);
				break;
			}

			iteration += 1;
			await new Promise((r) => setTimeout(r, 600));
		}
	} catch (err: any) {
		setMessages((prev) => [...prev, { type: "agent", text: `❌ ${err?.message || "Unexpected error"}` }]);
	} finally {
		setIsProcessing(false);
	}
}

function normalizeAction(input: any): any {
	const tool = input?.tool || input?.action;
	const parameters = input?.parameters || {};
	const mapping: Record<string, string> = {
		CLICK: "CLICK", click: "CLICK",
		TYPE: "TYPE", input: "TYPE", type: "TYPE",
		SCROLL: "SCROLL", scroll: "SCROLL",
		NAVIGATE: "NAVIGATE", url: "NAVIGATE", navigate: "NAVIGATE",
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
		case "CLICK": return `🖱️ Clicking element ${describeTarget(action)}`;
		case "TYPE": return `⌨️ Typing into ${describeTarget(action)}${action.text ? `: "${truncate(action.text, 60)}"` : ""}`;
		case "SCROLL": return `🧭 Scrolling ${action.direction || "down"}`;
		case "NAVIGATE": return `🌐 Navigating to ${action.url || "(missing url)"}`;
		default: return `➡️ Executing ${action.type}`;
	}
}

function describeTarget(action: any): string {
    // Now describes the richest selector available
	if (action.data_navigator_id) return `with data-navigator-id '${action.data_navigator_id}'`;
	if (action.xpath) return `with xpath '${action.xpath}'`;
	if (action.selector) return `with selector '${action.selector}'`;
	if (action.element_id) return `with internal id '${action.element_id}'`;
	return "(unspecified target)";
}

function truncate(s: string, n: number): string {
	return s.length > n ? s.slice(0, n - 1) + "…" : s;
}