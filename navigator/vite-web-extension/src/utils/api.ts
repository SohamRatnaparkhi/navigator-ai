import type { DOMData, CreateTaskResponse, DOMUpdate } from "../types";
import { sendMessageToBackground } from "./messages";

export async function createTask(serverUrl: string, query: string, url: string, openTabsWithIds: string[], currentTab: string): Promise<CreateTaskResponse> {
  const response = await sendMessageToBackground({
    type: "CREATE_TASK",
    payload: { serverUrl, query, url, openTabsWithIds, currentTab }
  });

  if (response.type === "CREATE_TASK_RESPONSE") {
    if (response.payload.success && response.payload.data) {
      return response.payload.data;
    } else {
      throw new Error(response.payload.error || "Failed to create task");
    }
  }

  throw new Error("Unexpected response type");
}

export async function updateTaskDom(serverUrl: string, payload: DOMUpdate): Promise<void> {
  const response = await sendMessageToBackground({
    type: "UPDATE_TASK",
    payload: {
      serverUrl,
      task_id: payload.task_id,
      dom_data: payload.dom_data,
      iterationNumber: payload.iterationNumber ?? 0,
      openTabsWithIds: payload.openTabsWithIds ?? [],
      currentTab: payload.currentTab ?? null,
    }
  });

  if (response.type === "UPDATE_TASK_RESPONSE") {
    if (!response.payload.success) {
      throw new Error(response.payload.error || "Failed to update task");
    }
  } else {
    throw new Error("Unexpected response type");
  }
} 