import type { DOMData } from "./dom";
import type { ChainOfThought } from "./api";

export interface CreateTaskMessage {
  type: "CREATE_TASK";
  payload: {
    serverUrl: string;
    query: string;
    url: string;
    openTabsWithIds: string[];
    currentTab: string;
  };
}

export interface CreateTaskResponse {
  type: "CREATE_TASK_RESPONSE";
  payload: {
    success: boolean;
    data?: {
      task_id: string;
      chain_of_thought?: ChainOfThought;
    };
    error?: string;
  };
}

export interface UpdateTaskMessage {
  type: "UPDATE_TASK";
  payload: {
    serverUrl: string;
    task_id: string;
    dom_data: DOMData;
    iterationNumber?: number;
    openTabsWithIds?: string[];
    currentTab?: Record<string, unknown> | null;
  };
}

export interface UpdateTaskResponse {
  type: "UPDATE_TASK_RESPONSE";
  payload: {
    success: boolean;
    error?: string;
  };
}

export interface UpdateTaskAndGetPlanMessage {
  type: "UPDATE_TASK_AND_GET_PLAN";
  payload: {
    serverUrl: string;
    task_id: string;
    dom_data: DOMData;
    iterationNumber?: number;
    openTabsWithIds?: string[];
    currentTab?: Record<string, unknown> | null;
    scratchpad?: string;
    add_todo?: string;
    mark_todo_done_index?: number;
  };
}

export interface UpdateTaskAndGetPlanResponse {
  type: "UPDATE_TASK_AND_GET_PLAN_RESPONSE";
  payload: {
    success: boolean;
    data?: any;
    error?: string;
  };
}

export interface CollectDomDataMessage {
  type: "COLLECT_DOM_DATA";
}

export interface CollectDomDataResponse {
  type: "COLLECT_DOM_DATA_RESPONSE";
  payload: {
    success: boolean;
    data?: DOMData;
    error?: string;
  };
}

export type BackgroundMessage = CreateTaskMessage | UpdateTaskMessage | UpdateTaskAndGetPlanMessage | CollectDomDataMessage;
export type ContentMessage = CreateTaskResponse | UpdateTaskResponse | UpdateTaskAndGetPlanResponse | CollectDomDataResponse; 