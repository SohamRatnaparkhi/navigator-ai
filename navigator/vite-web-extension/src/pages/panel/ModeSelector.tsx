import React from "react";
import { SparklesIcon, PlusIcon } from "@heroicons/react/24/solid";

interface ModeSelectorProps {
  mode: string;
  setMode: (mode: string) => void;
  handleNewAgent: () => void;
  theme: string;
}

export default function ModeSelector({ mode, setMode, handleNewAgent, theme }: ModeSelectorProps) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2 border-b ${
        theme === "dark" ? "border-gray-700" : "border-gray-200"
      }`}
    >
      <div
        className={`flex items-center space-x-1 p-1 rounded-lg ${
          theme === "dark" ? "bg-gray-800" : "bg-gray-100"
        }`}
      >
        <button
          onClick={() => setMode("agent")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
            mode === "agent"
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
              : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <SparklesIcon className="w-4 h-4" />
          <span>Agent</span>
        </button>
        <button
          onClick={() => setMode("ask")}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
            mode === "ask"
              ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
              : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          Ask
        </button>
      </div>

      {mode === "agent" && (
        <button
          onClick={handleNewAgent}
          className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
            theme === "dark"
              ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
          }`}
        >
          <PlusIcon className="w-4 h-4" />
          <span>New</span>
        </button>
      )}
    </div>
  );
} 