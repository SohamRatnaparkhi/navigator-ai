import React from "react";
import { MicrophoneIcon, PaperAirplaneIcon, StopIcon } from "@heroicons/react/24/solid";

interface InputAreaProps {
  query: string;
  setQuery: (query: string) => void;
  handleQuerySubmit: () => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isProcessing: boolean;
  mode: string;
  theme: string;
}

export default function InputArea({
  query,
  setQuery,
  handleQuerySubmit,
  handleKeyDown,
  isProcessing,
  mode,
  theme,
}: InputAreaProps) {
  return (
    <footer className={`p-6 border-t ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
      <div className="relative">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === "agent" ? "Tell me what you want to do..." : "Ask me about this page..."}
          className={`w-full rounded-2xl p-4 pr-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all duration-200 my-0 ${
            theme === "dark"
              ? "bg-gray-800 text-gray-200 placeholder-gray-400 border border-gray-700"
              : "bg-gray-50 text-gray-900 placeholder-gray-500 border border-gray-200"
          }`}
          rows={1}
          disabled={isProcessing}
        />
        <div className="absolute bottom-2 right-2 flex items-center space-x-1">
          {!isProcessing && (
            <button
              className={`p-2 rounded-xl transition-all duration-200 ${
                theme === "dark"
                  ? "hover:bg-gray-700 text-gray-400 hover:text-gray-200"
                  : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
              }`}
            >
              <MicrophoneIcon className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleQuerySubmit}
            disabled={!query.trim() && !isProcessing}
            className={`p-2 rounded-xl transition-all duration-200 my-2 ${
              isProcessing
                ? "bg-red-500 hover:bg-red-600 text-white"
                : query.trim()
                  ? "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : theme === "dark"
                    ? "bg-gray-700 text-gray-500"
                    : "bg-gray-200 text-gray-400"
            }`}
          >
            {isProcessing ? <StopIcon className="w-5 h-5" /> : <PaperAirplaneIcon className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </footer>
  );
} 