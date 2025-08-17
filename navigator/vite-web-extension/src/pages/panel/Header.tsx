import { SparklesIcon, CogIcon, ChatBubbleLeftRightIcon, PlusIcon } from "@heroicons/react/24/solid";

interface HeaderProps {
  theme: string;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  mode: string;
  setMode: (mode: string) => void;
  onNewChat: () => void;
}

export default function Header({ theme, activeTab, setActiveTab, mode, setMode, onNewChat }: HeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-3 border-b backdrop-blur-sm ${
        theme === "dark" ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-white/50"
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
          <SparklesIcon className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          NAI
        </h1>
      </div>

      {/* Center: Mode toggle */}
      <div
        className={`flex-1 flex justify-center items-center`}
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
      </div>

      <div className="flex items-center space-x-2">
        {activeTab === "main" ? (
          <>
            <button
              onClick={onNewChat}
              title="New chat"
              className={`p-2 rounded-lg transition-all duration-200 ${
                theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
              }`}
            >
              <PlusIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              title="Open settings"
              className={`p-2 rounded-lg transition-all duration-200 ${
                theme === "dark"
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
              }`}
            >
              <CogIcon className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button
            onClick={() => setActiveTab("main")}
            title="Back to chat"
            className={`p-2 rounded-lg transition-all duration-200 ${
              theme === "dark"
                ? "bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200"
            }`}
          >
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
} 