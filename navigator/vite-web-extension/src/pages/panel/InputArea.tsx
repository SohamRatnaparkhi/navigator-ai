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
  const hasText = query.trim().length > 0;
  const containerIsColumn = hasText && !isProcessing;
  const shellClasses =
    theme === "dark"
      ? "bg-gray-800 text-gray-200 placeholder-gray-400 border border-gray-700"
      : "bg-gray-50 text-gray-900 placeholder-gray-500 border border-gray-200";

  return (
    <footer className={`p-4 border-t ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
      <div className={`w-full rounded-2xl ${shellClasses} p-2`}>
        <div className={`${containerIsColumn ? "flex flex-col gap-2" : "flex items-end gap-2"}`}>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={mode === "agent" ? "Tell me what you want to do..." : "Ask me about this page..."}
            className={`flex-1 w-full rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-0 text-sm transition-all duration-200 my-0 nai-scroll overflow-y-auto overflow-x-hidden bg-transparent`}
            rows={containerIsColumn ? 3 : 1}
            disabled={isProcessing}
          />

          {containerIsColumn ? (
            <div className="flex items-center justify-end gap-2">
              {!isProcessing && (
                <button
                  className={`px-3 py-2 rounded-xl transition-all duration-200 ${theme === "dark"
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
                className={`px-3 py-2 rounded-xl transition-all duration-200 ${isProcessing
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
          ) : (
            <div className="flex items-center gap-1">
              {!isProcessing && (
                <button
                  className={`p-2 rounded-xl transition-all duration-200 ${theme === "dark"
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
                className={`p-2 rounded-xl transition-all duration-200 ${isProcessing
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
          )}
        </div>
      </div>
    </footer>
  );
} 