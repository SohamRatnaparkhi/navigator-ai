import Browser from 'webextension-polyfill';
import type { BackgroundMessage, ContentMessage, CreateTaskMessage, UpdateTaskMessage } from '../../types';
import { isValidUrl } from '../../utils/dom';

console.log('background script loaded');

// Track last known active tab and window to improve tab resolution when the side panel is focused
let lastKnownActiveTabId: number | null = null;
let lastKnownWindowId: number | null = null;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    lastKnownActiveTabId = activeInfo.tabId;
    lastKnownWindowId = activeInfo.windowId;
  } catch (_) {}
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId && windowId !== chrome.windows.WINDOW_ID_NONE) {
    lastKnownWindowId = windowId;
    try {
      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab && tab.id) lastKnownActiveTabId = tab.id;
    } catch (_) {}
  }
});

async function resolveActiveTab(): Promise<chrome.tabs.Tab | null> {
  // 1) Try the truly active tab of the last focused window
  const [tabInFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tabInFocused && tabInFocused.id) return tabInFocused;

  // 2) Try currentWindow (sometimes works depending on panel context)
  const [tabInCurrent] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabInCurrent && tabInCurrent.id) return tabInCurrent;

  // 3) Try last known window id
  if (lastKnownWindowId != null) {
    const [tabInKnownWindow] = await chrome.tabs.query({ active: true, windowId: lastKnownWindowId });
    if (tabInKnownWindow && tabInKnownWindow.id) return tabInKnownWindow;
  }

  // 4) Try last known active tab id
  if (lastKnownActiveTabId != null) {
    try {
      const tab = await chrome.tabs.get(lastKnownActiveTabId);
      if (tab && tab.id) return tab;
    } catch (_) {}
  }

  // 5) Fallback: choose a plausible normal tab
  const allNormalWindows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] as any });
  for (const win of allNormalWindows) {
    const tabs = (win as any).tabs as chrome.tabs.Tab[] | undefined;
    if (!tabs) continue;
    const candidate = tabs.find(t => !!t.id && !!t.url && isValidUrl(t.url!));
    if (candidate) return candidate;
  }

  return null;
}

Browser.runtime.onInstalled.addListener(async () => {
  // @ts-ignore
  if (Browser.sidePanel) {
    try {
      // @ts-ignore
      await Browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } catch (error) {
      console.error('Error setting side panel behavior:', error);
    }
  }
});

Browser.action.onClicked.addListener((tab) => {
  // @ts-ignore
  if (!Browser.sidePanel) {
    Browser.windows.create({
      url: Browser.runtime.getURL('src/pages/popup/index.html'),
      type: 'popup',
      width: 400,
      height: 600
    });
  }
});

chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender, sendResponse) => {
  console.log('Background received message:', message)

  if (message.type === 'CREATE_TASK') {
    handleCreateTask(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({
        type: 'CREATE_TASK_RESPONSE',
        payload: { success: false, error: error.message }
      }))
    return true
  }

  if (message.type === 'UPDATE_TASK') {
    handleUpdateTask(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({
        type: 'UPDATE_TASK_RESPONSE',
        payload: { success: false, error: error.message }
      }))
    return true
  }

  if (message.type === 'UPDATE_TASK_AND_GET_PLAN') {
    handleUpdateTaskAndGetPlan(message)
      .then((response) => sendResponse(response))
      .catch((error) => sendResponse({
        type: 'UPDATE_TASK_AND_GET_PLAN_RESPONSE',
        payload: { success: false, error: error.message }
      }))
    return true
  }

  if (message.type === 'COLLECT_DOM_DATA') {
    handleCollectDomData()
      .then((data) => sendResponse({
        type: 'COLLECT_DOM_DATA_RESPONSE',
        payload: { success: true, data }
      }))
      .catch((error) => sendResponse({
        type: 'COLLECT_DOM_DATA_RESPONSE',
        payload: { success: false, error: error.message }
      }));
    return true;
  }

  return false
})

async function handleCreateTask(message: CreateTaskMessage): Promise<ContentMessage> {
  const { serverUrl, query, url, openTabsWithIds, currentTab } = message.payload;

  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/tasks/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: query, url, openTabsWithIds, currentTab }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create task – ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      type: 'CREATE_TASK_RESPONSE',
      payload: {
        success: true,
        data: {
          task_id: data.task_id,
          chain_of_thought: data.chain_of_thought || []
        }
      }
    };
  } catch (error: any) {
    return {
      type: 'CREATE_TASK_RESPONSE',
      payload: {
        success: false,
        error: error.message
      }
    };
  }
}

async function handleUpdateTask(message: UpdateTaskMessage): Promise<ContentMessage> {
  const { serverUrl, task_id, dom_data, iterationNumber, openTabsWithIds, currentTab } = message.payload;

  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/tasks/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id,
        dom_data,
        iterationNumber: iterationNumber ?? 0,
        openTabsWithIds: openTabsWithIds ?? [],
        currentTab: currentTab ?? null,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update task – ${response.status} ${response.statusText}`);
    }

    return {
      type: 'UPDATE_TASK_RESPONSE',
      payload: { success: true }
    };
  } catch (error: any) {
    return {
      type: 'UPDATE_TASK_RESPONSE',
      payload: {
        success: false,
        error: error.message
      }
    };
  }
}

async function handleUpdateTaskAndGetPlan(message: any): Promise<ContentMessage> {
  const { serverUrl, task_id, dom_data, iterationNumber, openTabsWithIds, currentTab, scratchpad, add_todo, mark_todo_done_index, iteration_result } = message.payload;

  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/tasks/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task_id,
        dom_data,
        iterationNumber: iterationNumber ?? 0,
        openTabsWithIds: openTabsWithIds ?? [],
        currentTab: currentTab ?? null,
        scratchpad,
        add_todo,
        mark_todo_done_index,
        iteration_result
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update task – ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return {
      type: 'UPDATE_TASK_AND_GET_PLAN_RESPONSE',
      payload: { success: true, data }
    };
  } catch (error: any) {
    return {
      type: 'UPDATE_TASK_AND_GET_PLAN_RESPONSE',
      payload: {
        success: false,
        error: error.message
      }
    };
  }
}

async function handleCollectDomData(): Promise<any> {
    console.log('AGENT: Collecting DOM data with expanded viewport...');
    let tab: chrome.tabs.Tab | null = await resolveActiveTab();
    let retryCount = 0;
    const maxRetries = 5;

    while ((!tab || !tab.id) && retryCount < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 200 + retryCount * 200));
      tab = await resolveActiveTab();
      retryCount++;
    }

    if (!tab || !tab.id) {
      throw new Error('No active tab available. Focus a normal webpage and try again.');
    }

    // Avoid trying to inject into restricted schemes
    if (!tab.url || !isValidUrl(tab.url)) {
      throw new Error('Active tab is not a standard webpage (chrome://, extensions, etc). Please switch to a normal page.');
    }
    const tabId = tab.id;

    const allFrames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!allFrames) {
        throw new Error('Could not get frame information for the tab.');
    }

    const isDebugMode = (await chrome.storage.local.get('debugMode')).debugMode == 'true';
    const executionResults = await Promise.all(
        allFrames.map(frame => {
            return chrome.scripting.executeScript({
                target: { tabId, frameIds: [frame.frameId] },
                func: () => {
                    const viewportExpansion = 100;

                    const getRandomColor = (): string => {
                        const letters = '0123456789ABCDEF';
                        let color = '#';
                        for (let i = 0; i < 6; i++) {
                            color += letters[Math.floor(Math.random() * 16)];
                        }
                        return color;
                    };

                    const interactiveMetadata: Record<string, any> = {};
                    let elementIdCounter = 0;

                    const selector = 'a, button, input, select, textarea, summary, label[for], [role], [onclick], [contenteditable], [tabindex]';
                    const viableCandidates: HTMLElement[] = [];
                    const candidateElements = document.querySelectorAll(selector);

                    candidateElements.forEach(el => {
                        if (!(el instanceof HTMLElement)) return;

                        try {
                            const rect = el.getBoundingClientRect();
                            if (rect.width < 1 || rect.height < 1) return;

                            if ((el as HTMLButtonElement).disabled || el.closest('[disabled]')) return;

                            const isInExpandedViewport = (
                                rect.top < (window.innerHeight + viewportExpansion) &&
                                rect.bottom > (0 - viewportExpansion) &&
                                rect.left < (window.innerWidth + viewportExpansion) &&
                                rect.right > (0 - viewportExpansion)
                            ) ;

                            if (!isInExpandedViewport) return;

                            const centerX = rect.left + rect.width / 2;
                            const centerY = rect.top + rect.height / 2;
                            const topElement = document.elementFromPoint(centerX, centerY);
                            if (!topElement || (!topElement.isSameNode(el) && !el.contains(topElement))) return;
                            
                            if (isDebugMode) {
                                const color = getRandomColor();
                                el.style.border = `2px solid ${color}`;
                                el.style.boxSizing = 'border-box';
                                el.style.position = 'relative';
                                
                                // element ID label in bottom right corner
                                const label = document.createElement('div');
                                label.textContent = elementIdCounter.toString();
                                label.style.position = 'absolute';
                                label.style.bottom = '0';
                                label.style.right = '0';
                                label.style.fontSize = '8px';
                                label.style.color = color;
                                label.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
                                label.style.padding = '1px 3px';
                                label.style.borderRadius = '2px';
                                label.style.pointerEvents = 'none';
                                label.style.zIndex = '9999';
                                label.style.fontFamily = 'monospace';
                                el.appendChild(label);
                            }

                            const elementId = `nav-id-${elementIdCounter++}`;
                            el.setAttribute('data-navigator-id', elementId);
                            if (isDebugMode) {
                                el.classList.add('nav-debug');
                            }
                            viableCandidates.push(el);

                        } catch (e) { 
                          console.error('Error processing element:', e);
                        }
                    });

                    viableCandidates.forEach(el => {
                        const elementId = el.getAttribute('data-navigator-id');
                        if (!elementId) return;

                        const style = window.getComputedStyle(el);
                        const interactiveAncestor = el.parentElement?.closest('[data-navigator-id]');
                        
                        interactiveMetadata[elementId] = {
                            cursor: style.cursor,
                            interactive_ancestor_id: interactiveAncestor ? interactiveAncestor.getAttribute('data-navigator-id') : null
                        };
                    });

                    const html = document.documentElement.outerHTML;
                    
                    return { html, metadata: interactiveMetadata };
                }
            }).then(result => ({
                frameId: frame.frameId,
                parentFrameId: frame.parentFrameId,
                url: frame.url,
                result: result[0]?.result 
            }));
        })
    );

    const framesData = executionResults.filter(r => r.result).map(r => ({
        frame_id: r.frameId,
        parent_frame_id: r.parentFrameId,
        url: r.url,
        html: r.result?.html ?? '',
        metadata: r.result?.metadata ?? {}
    }));

    if (framesData.length === 0) {
        throw new Error("Failed to collect DOM from any frames.");
    }
    
    console.log(`AGENT: Collection complete. Captured data from ${framesData.length} frames.`);
    console.log("data", framesData);

    return {
        url: tab.url ?? "",
        title: tab.title ?? "",
        timestamp: new Date().toISOString(),
        frames: framesData
    };
}