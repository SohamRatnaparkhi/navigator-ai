import type { DOMData } from "./dom";

export interface CoTStep {
  title: string;
  description: string;
}

export interface ChainOfThought {
  title: string;
  steps: CoTStep[];
}

export interface CreateTaskResponse {
  task_id: string;
  chain_of_thought?: ChainOfThought;
  [key: string]: unknown;
}

export interface DOMUpdate {
  task_id: string;
  dom_data: DOMData;
  iterationNumber?: number;
  openTabsWithIds?: string[];
  currentTab?: Record<string, unknown> | null;
  // Optional context management fields
  scratchpad?: string;
  add_todo?: string;
  mark_todo_done_index?: number;
} 