import { useEffect, useState } from 'react';
import type { TaskState } from '../types';

type Tab = 'automation' | 'knowledge' | 'history' | 'settings';

export default function Sidebar() {
    const [isOpen, setIsOpen] = useState(true);
    const [activeTab, setActiveTab] = useState<Tab>('automation');
    const [state, setState] = useState<TaskState>({
        taskId: null,
        status: 'idle',
        task: '',
        isRunning: false,
        isPaused: false,
        iterations: 0
    });

    useEffect(() => {
        console.log('Sidebar component mounted');

        chrome.storage.local.get(['taskState', 'sidebarOpen', 'activeTab', 'activeSession'], (result) => {
            console.log('Loaded from storage:', result);

            if (result.taskState) {
                setState(result.taskState);
            }

            if (result.sidebarOpen !== undefined) {
                setIsOpen(result.sidebarOpen);
            }
            if (result.activeTab) {
                setActiveTab(result.activeTab as Tab);
            }
            if (result.activeSession?.taskId) {
                setState(prev => ({
                    ...prev,
                    taskId: result.activeSession.taskId,
                    status: result.activeSession.status === 'completed' ? 'completed' :
                        result.activeSession.status === 'error' ? 'error' :
                            result.activeSession.isPaused ? 'paused' : 'running',
                    isRunning: result.activeSession.status === 'active',
                    isPaused: result.activeSession.isPaused || false
                }));
            }
        });

        const messageListener = (message: { type: string; iterations?: number; stopMonitoring?: boolean; pauseStateChanged?: boolean; isPaused?: boolean; status?: string }) => {
            if (message.type === 'iterationUpdate') {
                setState(prev => ({
                    ...prev,
                    iterations: message.iterations || prev.iterations
                }));
            } else if (message.type === 'stopMonitoring') {
                setState(prev => ({
                    ...prev,
                    status: 'completed',
                    isRunning: false
                }));

                chrome.storage.local.set({
                    taskState: {
                        ...state,
                        status: 'completed',
                        isRunning: false
                    }
                }).catch(err => console.error('Error saving completed state:', err));
            } else if (message.type === 'pauseStateChanged') {
                setState(prev => ({
                    ...prev,
                    isPaused: message.isPaused || false,
                    status: message.isPaused ? 'paused' : 'running'
                }));
            } else if (message.type === 'workflowReset') {
                // Reset the state completely when workflow reset is received
                setState({
                    taskId: null,
                    status: 'idle',
                    task: '',
                    isRunning: false,
                    isPaused: false,
                    iterations: 0
                });
            }
        };

        chrome.runtime.onMessage.addListener(messageListener);

        document.body.style.background = 'transparent';

        return () => {
            chrome.runtime.onMessage.removeListener(messageListener);
        };
    }, []);

    useEffect(() => {
        chrome.storage.local.set({ sidebarOpen: isOpen });

        if (typeof chrome !== 'undefined' && chrome.tabs) {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, {
                        type: 'updateSidebarState',
                        isOpen
                    }).catch(err => {
                        console.error('Error sending sidebar state:', err);
                    });
                }
            });
        }
    }, [isOpen]);

    useEffect(() => {
        chrome.storage.local.set({ activeTab });
    }, [activeTab]);

    const handleStartTask = async () => {
        if (!state.task.trim()) return;

        try {
            console.log('Starting task...');
            setState(prev => ({ ...prev, status: 'running' }));

            const response = await chrome.runtime.sendMessage({
                type: 'startTask',
                task: state.task
            });

            if (response?.task_id) {
                const newState: TaskState = {
                    ...state,
                    taskId: response.task_id,
                    status: 'running',
                    isRunning: true,
                    isPaused: false,
                    iterations: 0
                };

                await chrome.storage.local.set({ taskState: newState });
                setState(newState);

                // Start monitoring
                chrome.runtime.sendMessage({ type: 'startMonitoring', task_id: response.task_id });
            }
        } catch (error) {
            console.error('Error starting task:', error);
            setState(prev => ({ ...prev, status: 'error' }));
        }
    };

    const handleStopTask = async () => {
        try {
            console.log('Stopping task...');
            setState(prev => ({ ...prev, status: 'idle' }));
            chrome.runtime.sendMessage({ type: 'stopMonitoring' });

            const newState: TaskState = {
                ...state,
                status: 'idle',
                isRunning: false,
                isPaused: false
            };

            await chrome.storage.local.set({ taskState: newState });
            setState(newState);
        } catch (error) {
            console.error('Error stopping task:', error);
        }
    };

    const handlePauseTask = async () => {
        try {
            console.log('Pausing task...');
            const newState: TaskState = {
                ...state,
                status: 'paused',
                isPaused: true
            };

            await chrome.storage.local.set({ taskState: newState });
            setState(newState);
            chrome.runtime.sendMessage({ type: 'pauseMonitoring' });
        } catch (error) {
            console.error('Error pausing task:', error);
        }
    };

    const handleResumeTask = async () => {
        try {
            console.log('Resuming task...');
            const newState: TaskState = {
                ...state,
                status: 'running',
                isPaused: false
            };

            await chrome.storage.local.set({ taskState: newState });
            setState(newState);
            chrome.runtime.sendMessage({ type: 'resumeMonitoring' });
        } catch (error) {
            console.error('Error resuming task:', error);
        }
    };
    
    const handleResetWorkflow = async () => {
        try {
            console.log('Resetting workflow...');
            
            // Call the background script to reset the workflow
            await chrome.runtime.sendMessage({ type: 'resetWorkflow' });
            
            // Update local state
            const newState: TaskState = {
                taskId: null,
                status: 'idle',
                task: '',
                isRunning: false,
                isPaused: false,
                iterations: 0
            };
            
            setState(newState);
            
            // Show confirmation to user
            alert('Workflow has been reset successfully.');
        } catch (error) {
            console.error('Error resetting workflow:', error);
            alert('Failed to reset workflow. Please try again.');
        }
    };

    const getStatusColor = () => {
        switch (state.status) {
            case 'running': return 'bg-green-500';
            case 'error': return 'bg-red-500';
            case 'idle': return 'bg-yellow-500';
            case 'completed': return 'bg-blue-500';
            case 'paused': return 'bg-orange-500';
            default: return 'bg-gray-400';
        }
    };

    const getStatusText = () => {
        switch (state.status) {
            case 'running': return 'Running';
            case 'error': return 'Error';
            case 'idle': return 'Idle';
            case 'completed': return 'Completed';
            case 'paused': return 'Paused';
            default: return 'Idle';
        }
    };

    if (!isOpen) {
        return (
            <div className="fixed top-20 right-0 z-50 flex flex-col gap-2">
                <button
                    onClick={() => setIsOpen(true)}
                    className="flex items-center justify-center w-12 h-12 bg-slate-800/90 hover:bg-slate-700/90 text-white rounded-l-lg border border-slate-700/50 border-r-0 shadow-lg transition-all duration-300"
                    title="Open Navigator AI"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>

                {state.isRunning && (
                    <div
                        className={`w-12 h-12 flex items-center justify-center rounded-l-lg border border-slate-700/50 border-r-0 shadow-lg ${state.isPaused ? 'bg-orange-600/90' : 'bg-green-600/90'
                            }`}
                        title={state.isPaused ? 'Task Paused' : 'Task Running'}
                    >
                        {state.isPaused ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                            </svg>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="fixed top-0 right-0 z-50 h-full w-96 shadow-xl transition-all duration-300 transform">
            <div className="h-full w-full flex flex-col bg-slate-800/95 backdrop-blur-md border-l border-slate-700/50 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 bg-slate-700/90 border-b border-slate-600/90">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                        </svg>
                        Navigator AI
                    </h2>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 rounded-md text-slate-300 hover:text-white hover:bg-slate-600/90 focus:outline-none focus:ring-2 focus:ring-slate-400"
                        title="Close Sidebar"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-slate-600/90">
                    <button
                        onClick={() => setActiveTab('automation')}
                        className={`flex-1 py-3 text-center font-medium transition-colors ${activeTab === 'automation'
                            ? 'text-white border-b-2 border-blue-500'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        Automation
                    </button>
                    <button
                        onClick={() => setActiveTab('knowledge')}
                        className={`flex-1 py-3 text-center font-medium transition-colors ${activeTab === 'knowledge'
                            ? 'text-white border-b-2 border-blue-500'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        Knowledge
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-3 text-center font-medium transition-colors ${activeTab === 'history'
                            ? 'text-white border-b-2 border-blue-500'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        History
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`flex-1 py-3 text-center font-medium transition-colors ${activeTab === 'settings'
                            ? 'text-white border-b-2 border-blue-500'
                            : 'text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        Settings
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {activeTab === 'automation' && (
                        <div className="space-y-5">
                            <div>
                                <label htmlFor="task-input" className="block text-sm font-medium text-slate-300 mb-2">
                                    Task Description
                                </label>
                                <input
                                    id="task-input"
                                    type="text"
                                    value={state.task}
                                    onChange={(e) => setState(prev => ({ ...prev, task: e.target.value }))}
                                    placeholder="Enter what you want to automate..."
                                    disabled={state.isRunning}
                                    className="w-full px-4 py-3 bg-slate-700/80 border border-slate-600/90 rounded-md shadow-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                                />
                            </div>

                            <div>
                                {!state.isRunning ? (
                                    <button
                                        onClick={handleStartTask}
                                        disabled={!state.task.trim()}
                                        className="w-full px-4 py-3 text-white bg-blue-600/90 hover:bg-blue-700/90 rounded-md shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Start Automation
                                    </button>
                                ) : (
                                    <div className="flex gap-2">
                                        {!state.isPaused ? (
                                            <button
                                                onClick={handlePauseTask}
                                                className="flex-1 px-4 py-3 text-white bg-orange-600/90 hover:bg-orange-700/90 rounded-md shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors"
                                            >
                                                <div className="flex items-center justify-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                    </svg>
                                                    Pause
                                                </div>
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleResumeTask}
                                                className="flex-1 px-4 py-3 text-white bg-green-600/90 hover:bg-green-700/90 rounded-md shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                                            >
                                                <div className="flex items-center justify-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                    </svg>
                                                    Resume
                                                </div>
                                            </button>
                                        )}
                                        <button
                                            onClick={handleStopTask}
                                            className="flex-1 px-4 py-3 text-white bg-red-600/90 hover:bg-red-700/90 rounded-md shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-red-500 transition-colors"
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                                                </svg>
                                                Stop
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                                
                            {/* Reset Workflow Button */}
                            <div className="mt-3">
                                <button
                                    onClick={handleResetWorkflow}
                                    className="w-full px-4 py-2 text-white bg-slate-600/90 hover:bg-slate-700/90 rounded-md shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors text-sm"
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                        </svg>
                                        Reset Workflow
                                    </div>
                                </button>
                            </div>

                            {/* Status Panel */}
                            <div className="p-4 bg-slate-700/80 rounded-lg border border-slate-600/90">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-slate-400">Status:</span>
                                        <div className="flex items-center space-x-2">
                                            <span className={`inline-block w-3 h-3 rounded-full ${getStatusColor()} ${state.isPaused ? '' : state.isRunning ? 'animate-pulse' : ''}`}></span>
                                            <span className="font-medium text-white">{getStatusText()}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center pt-3 border-t border-slate-600/80">
                                        <span className="text-slate-400">Task ID:</span>
                                        <span className="font-mono text-xs bg-slate-800/80 px-2 py-1 rounded text-slate-300">
                                            {state.taskId ? state.taskId.substring(0, 10) : 'None'}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center pt-3 border-t border-slate-600/80">
                                        <span className="text-slate-400">Iterations:</span>
                                        <div className="flex items-center">
                                            <span className="font-medium text-white">{state.iterations}</span>
                                            {state.isRunning && state.iterations > 0 && !state.isPaused && (
                                                <span className="ml-2 text-xs px-2 py-0.5 bg-blue-500 rounded-full text-white">
                                                    Running
                                                </span>
                                            )}
                                            {state.isRunning && state.isPaused && (
                                                <span className="ml-2 text-xs px-2 py-0.5 bg-orange-500 rounded-full text-white">
                                                    Paused
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'knowledge' && (
                        <div className="space-y-5">
                            <h3 className="text-lg font-medium text-slate-200">Knowledge Base</h3>
                            <p className="text-slate-400">Upload custom files and videos to enhance the AI's understanding.</p>

                            <div className="border-2 border-dashed border-slate-600/90 rounded-lg p-8 text-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0l-4 4m4-4v12" />
                                </svg>
                                <p className="text-slate-300 mb-2">Drag and drop files here</p>
                                <p className="text-slate-400 text-sm mb-4">or</p>
                                <button className="px-4 py-2 bg-blue-600/90 hover:bg-blue-700/90 text-white rounded-md">
                                    Browse Files
                                </button>
                                <p className="text-slate-400 text-xs mt-3">
                                    Supports PDF, TXT, DOCX, MP4, and more
                                </p>
                            </div>

                            <div className="mt-6">
                                <h4 className="text-md font-medium text-slate-300 mb-3">Uploaded Files</h4>
                                <p className="text-slate-400 text-sm italic">No files uploaded yet</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div className="space-y-5">
                            <h3 className="text-lg font-medium text-slate-200">Automation History</h3>
                            <p className="text-slate-400">View your past automation runs and their results.</p>

                            <div className="bg-slate-700/80 rounded-lg border border-slate-600/90 overflow-hidden">
                                <div className="p-4 text-center text-slate-400 italic">
                                    No automation history yet
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'settings' && (
                        <div className="space-y-5">
                            <h3 className="text-lg font-medium text-slate-200">Settings</h3>

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-slate-300">API Endpoint</span>
                                    <input
                                        type="text"
                                        className="w-48 px-3 py-2 bg-slate-700/80 border border-slate-600/90 rounded-md text-white text-sm"
                                        defaultValue="http://localhost:8000"
                                    />
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-300">Theme</span>
                                    <select className="w-48 px-3 py-2 bg-slate-700/80 border border-slate-600/90 rounded-md text-white text-sm">
                                        <option>Dark</option>
                                        <option>Light</option>
                                        <option>System</option>
                                    </select>
                                </div>

                                <div className="flex items-center justify-between">
                                    <span className="text-slate-300">Default Tab</span>
                                    <select className="w-48 px-3 py-2 bg-slate-700/80 border border-slate-600/90 rounded-md text-white text-sm">
                                        <option>Automation</option>
                                        <option>Knowledge</option>
                                        <option>History</option>
                                        <option>Settings</option>
                                    </select>
                                </div>

                                <div className="pt-4 border-t border-slate-600/80">
                                    <button className="px-4 py-2 text-white bg-blue-600/90 hover:bg-blue-700/90 rounded-md shadow-sm text-sm">
                                        Save Settings
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-700/80 px-5 py-3 text-center text-xs text-slate-400 border-t border-slate-600/90">
                    Navigator AI v1.0.0 • Built with 💙
                </div>
            </div>
        </div>
    );
}