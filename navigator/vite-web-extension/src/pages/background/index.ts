import Browser from 'webextension-polyfill';
import type { BackgroundMessage, ContentMessage, CreateTaskMessage, UpdateTaskMessage, DOMData } from '../../types';
import { isValidUrl } from '../../utils/dom';

console.log('background script loaded');

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
  const { serverUrl, query } = message.payload;
  
  try {
    const response = await fetch(`${serverUrl.replace(/\/$/, '')}/tasks/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task: query }),
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

async function handleCollectDomData(): Promise<DOMData> {
  console.log('Background: Starting to collect DOM data');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error('No active tab found');
  }
  const tabId = tab.id;
  console.log(`Active tab: ${tabId}, url: ${tab.url}`);
  if (!isValidUrl(tab.url || '')) {
    throw new Error('Invalid URL for DOM collection');
  }
  const frames = await new Promise<any[] | null>((res) => chrome.webNavigation.getAllFrames({ tabId }, res));
  if (!frames || frames.length === 0) {
    throw new Error('No frames found');
  }
  console.log(`Found ${frames.length} frames`);
  const payload = await Promise.all(
    frames.map(async (frame) => {
      console.log(`Injecting into frame ${frame.frameId}`);
      const [result] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frame.frameId] },
        func: () => document.documentElement.outerHTML,
      });
      return { id: frame.frameId, html: result?.result ?? '' };
    })
  );
  const main = payload.find((p) => p.id === 0)?.html ?? "";
  console.log(`Collected main HTML length: ${main.length}`);
  return {
    url: tab.url ?? "",
    html: main,
    title: tab.title ?? "",
    timestamp: new Date().toISOString(),
  };
}
