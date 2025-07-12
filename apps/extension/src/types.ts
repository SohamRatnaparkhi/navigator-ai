// src/types.ts
import { DOMHashMap } from "@navigator-ai/core";
import { Action, ExecuteActionResult } from "@navigator-ai/core";

export interface FrontendDOMState {
    url: string;
    html: string;
    title: string;
    timestamp: string;
    structure?: DOMHashMap;
}

export interface DOMUpdate {
    task_id: string;
    dom_data: FrontendDOMState;
    result: unknown[];
    iterations: number;
    structure: DOMHashMap;
    openTabsWithIds: { id: number; url: string }[];
    currentTab: { id: number; url: string };
}

export interface Message {
    type: 'startTask' | 'startMonitoring' | 'stopMonitoring' | 'processDOM' | 'toggleSidebar' | 'toggleUI' | 'updateSidebarState' | 'dom_update' | 'pauseMonitoring' | 'resumeMonitoring' | 'executeActions' | 'startSequentialProcessing' | 'check_processing_status' | 'resetIterations' | 'singleDOMProcess' | 'ping' | 'resetWorkflow' | 'checkDomainChange' | 'updateProcessingStatus' | 'openSidePanel' | 'closeSidePanel' | 'toggleSidePanel' | 'switchTab' | 'processingStatusUpdate' | 'invalidURL' | 'stopAutomation';
    task?: string;
    task_id?: string;
    dom_data?: FrontendDOMState;
    result?: unknown[];
    iterations?: number;
    maxIterations?: number;
    isPaused?: boolean;
    isOpen?: boolean;   // New property for sidebar state
    actions?: Action[];
    status?: ProcessingStatus;
    isDone?: boolean;   // Property for signaling if processing is complete
    currentUrl?: string; // Current URL for domain change detection
    iterationResults?: ExecuteActionResult[];
    tabId?: number;
}

// Processing status for DOM operations
export type ProcessingStatus = 
    'idle' |              // Not processing anything
    'parsing' |           // Parsing DOM with server
    'updating' |          // Sending update to API
    'executing_actions' | // Executing actions from API
    'waiting_for_server' | // Waiting for server response
    'completed' |         // Task completed
    'error' |             // Error occurred
    'paused' |            // Processing paused
    'stopping';          // Processing stopping

export interface TaskState {
    taskId: string | null;
    status: 'idle' | 'running' | 'completed' | 'error' | 'paused' | 'stopping';
    task: string;
    isRunning: boolean;
    iterations: number;
    isPaused: boolean;
    processingStatus?: ProcessingStatus; // Current processing step
    lastUpdateTimestamp?: string;        // Timestamp of last successful update
}

// New type for sidebar settings
export interface SidebarState {
    isOpen: boolean;
    activeTab: 'automation' | 'knowledge' | 'history' | 'settings';
}