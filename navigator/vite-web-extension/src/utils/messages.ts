import type { BackgroundMessage, ContentMessage } from "../types"

// Helper function to send messages from content script to background
export function sendMessageToBackground<T extends BackgroundMessage>(
  message: T
): Promise<ContentMessage> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: ContentMessage) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(response)
      }
    })
  })
} 