// In public/agent/automation-agent.js

if (!window.navigatorAgent) {
	console.log('[AGENT] Initializing Navigator Agent on the page...');

	const wait = (ms) => new Promise(r => setTimeout(r, ms));

	class Cursor {
		// ... No changes to the Cursor class ...
		element = null;
		constructor() { this.init(); }
		init() {
			if (document.getElementById('__navigator-agent-cursor__')) return;
			this.element = document.createElement('div');
			this.element.id = '__navigator-agent-cursor__';
			Object.assign(this.element.style, {
				position: 'fixed', zIndex: '2147483647', width: '20px', height: '20px',
				background: 'rgba(59, 130, 246, 0.8)', borderRadius: '50%',
				pointerEvents: 'none', transition: 'transform 0.2s ease-out, top 0.2s ease-out, left 0.2s ease-out',
				boxShadow: '0 0 10px rgba(59, 130, 246, 0.9)',
				transform: 'translate(-50%, -50%) scale(0)',
			});
			document.body.appendChild(this.element);
		}
		async moveTo(el) {
			if (!this.element) this.init();
			this.element.style.transform = 'translate(-50%, -50%) scale(1)';
			const rect = el.getBoundingClientRect();
			const targetX = rect.left + window.scrollX + rect.width / 2;
			const targetY = rect.top + window.scrollY + rect.height / 2;
			this.element.style.left = `${targetX}px`;
			this.element.style.top = `${targetY}px`;
			await wait(300);
		}
		hide() {
			if (this.element) this.element.style.transform = 'translate(-50%, -50%) scale(0)';
		}
	}


	class AutomationAgent {
		cursor;
		constructor() { this.cursor = new Cursor(); }

		async findElement(action, retries = 3) {
			// ... No changes to the findElement method ...
			for (let i = 0; i < retries; i++) {
				let element = null;
				if (action.data_navigator_id) element = document.querySelector(`[data-navigator-id="${action.data_navigator_id}"]`);
				if (!element && action.xpath) {
					try { element = document.evaluate(action.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch (e) { console.error("XPath error:", e); }
				}
				if (!element && action.selector) {
					try { element = document.querySelector(action.selector); } catch (e) { console.error("Selector error:", e); }
				}
				if (element) return element;
				if (i < retries - 1) {
					await wait((i + 1) * 500);
				}
			}
			throw new Error(`Element not found after ${retries} attempts for action: ${JSON.stringify(action)}`);
		}

		async execute(action) {
			try {
				const targetElement = await this.findElement(action);
				targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
				await wait(500); // Wait for scroll
				await this.cursor.moveTo(targetElement);
				
				if (action.type === 'SCROLL' && !action.data_navigator_id && !action.xpath && !action.selector) {
					console.log(`[AGENT] Performing window scroll: ${action.direction}`);
					const scrollAmount = window.innerHeight * 0.8;
					switch (action.direction) {
						case 'down':
							window.scrollBy(0, scrollAmount);
							break;
						case 'up':
							window.scrollBy(0, -scrollAmount);
							break;
						case 'top':
							window.scrollTo(0, 0);
							break;
						case 'bottom':
							window.scrollTo(0, document.body.scrollHeight);
							break;
					}
					await wait(500); // Wait for scroll animation
					return { success: true, message: `Scrolled ${action.direction}.` };
				}

				switch (action.type) {
					case 'TYPE':
						if (typeof action.text !== 'string') throw new Error("TYPE action requires text.");
						const inputEl = targetElement;
						inputEl.focus();
						inputEl.value = '';
						for (const char of action.text) {
							inputEl.value += char;
							inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
							await wait(40 + Math.random() * 40);
						}
						inputEl.dispatchEvent(new Event('change', { bubbles: true }));

						// --- NEW: AUTO-SUBMIT LOGIC ---
						await wait(200); // Small delay before submitting
						const parentForm = targetElement.closest('form');
						if (parentForm) {
							console.log('[AGENT] Submitting parent form.');
							parentForm.submit();
						} else {
							// Fallback if no form is found
							console.log('[AGENT] No parent form found, dispatching Enter key press.');
							targetElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
						}
						break;
					// --- END OF NEW LOGIC ---

					case 'CLICK':
						(targetElement).click();
						break;
					case 'SCROLL':
						break; // Handled by scrollIntoView
					default:
						throw new Error(`Unsupported action type: ${action.type}`);
				}
				// For actions that cause navigation (like submit), we might not reach here.
				// That's okay. The orchestrator will handle the resulting "frame removed" error.
				await wait(300);
				this.cursor.hide();
				return { success: true, message: `Action ${action.type} completed.` };
			} catch (error) {
				this.cursor.hide();
				return { success: false, message: error.message };
			}
		}
	}

	window.navigatorAgent = new AutomationAgent();
}