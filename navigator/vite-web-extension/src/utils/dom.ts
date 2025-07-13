import { sendMessageToBackground } from "./messages"
import type { DOMData } from "../types"

export function isValidUrl(url: string): boolean {
    return typeof url === 'string' &&
        !url.startsWith('chrome://') &&
        !url.startsWith('chrome-extension://') &&
        !url.startsWith('chrome-search://') &&
        !url.startsWith('about:') &&
        !url.startsWith('edge://') &&
        !url.startsWith('brave://');
}

export const collectDOMData = async (): Promise<DOMData> => {
  console.log('Requesting DOM data from background');
  const response = await sendMessageToBackground({ type: 'COLLECT_DOM_DATA' });
  if (response.type !== 'COLLECT_DOM_DATA_RESPONSE') {
    throw new Error('Unexpected response type');
  }
  const { payload } = response;
  if (payload.success && payload.data) {
    console.log('Received DOM data successfully');
    return payload.data;
  } else {
    console.error('Error collecting DOM:', payload.error);
    throw new Error(payload.error || 'Failed to collect DOM data');
  }
};