type ExecutionResult = { success: boolean; message?: string };

type ActionInput = {
	type: "CLICK" | "TYPE" | "SCROLL" | "NAVIGATE" | "TASK_COMPLETE" | "TASK_FAILED" | string;
	selector?: string;
	xpath?: string;
	element_id?: string;
	text?: string;
	direction?: "up" | "down";
	url?: string;
};

export async function executeAction(tabId: number, action: ActionInput, frameId?: number): Promise<ExecutionResult> {
	console.log(`[ORCHESTRATOR] Received action: ${action.type}`, { action, tabId, frameId });

	// Handle non-injected actions as before
	if (action.type === "TASK_COMPLETE" || action.type === "TASK_FAILED") return { success: true };
	if (action.type === "NAVIGATE") {
		if (!action.url) return { success: false, message: "NAVIGATE action requires a url parameter." };
		await chrome.tabs.update(tabId, { url: action.url });
		return { success: true };
	}

	// --- NEW: RESILIENT EXECUTION WITH RETRY LOGIC ---
	const MAX_ATTEMPTS = 2;
	let lastError: any = null;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const target: chrome.scripting.InjectionTarget = { tabId };
			// On the first attempt, use the provided frameId. On retries, default to the main frame (0).
			if (frameId !== undefined && attempt === 1) {
				target.frameIds = [frameId];
			}
			
			console.log(`[ORCHESTRATOR] Attempt #${attempt}: Injecting and executing on target:`, target);

			// Step 1: Ensure the agent script is loaded into the target frame.
			await chrome.scripting.executeScript({
				target: target,
				files: ['agent/automation-agent.js'],
			});

			// Step 2: Call the agent to perform the action.
			const [injectionResult] = await chrome.scripting.executeScript({
				target: target,
				world: "ISOLATED",
				args: [action],
				func: (actionToDo: ActionInput) => {
					// This function is now just a simple command to the already-injected agent
					if (!window.navigatorAgent) {
						return { success: false, message: "Agent failed to initialize on the page."};
					}
					return window.navigatorAgent.execute(actionToDo);
				},
			});

			if (injectionResult && injectionResult.result) {
				console.log("[ORCHESTRATOR] Action executed successfully on attempt #" + attempt);
				return injectionResult.result as ExecutionResult;
			}
		} catch (error: any) {
			lastError = error;
			const errorMessage = error.message || String(error);
			console.warn(`[ORCHESTRATOR] Attempt #${attempt} failed: ${errorMessage}`);

			// This is our intelligent fallback logic!
			if (errorMessage.includes("Frame with ID") && errorMessage.includes("was removed") || errorMessage.includes("No frame with id")) {
				if (attempt < MAX_ATTEMPTS) {
					console.log("[ORCHESTRATOR] Frame was removed, likely due to navigation. Waiting 1.5s and retrying on main frame...");
					await new Promise(resolve => setTimeout(resolve, 1500));
					continue; // Go to the next attempt in the loop
				}
			}
			
			// If it's a different kind of error, or we're out of retries, fail immediately.
			break;
		}
	}
	
	console.error("[ORCHESTRATOR] Action failed after all attempts. Final error:", lastError);
	return { success: false, message: lastError?.message || "Action failed after all attempts." };
}

// REMINDER: Make sure you have this in a global .d.ts file
declare global {
    interface Window {
        navigatorAgent: {
            execute(action: any): Promise<{success: boolean, message?: string}>;
        };
    }
}