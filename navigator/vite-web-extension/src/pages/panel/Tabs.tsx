import { CogIcon } from "@heroicons/react/24/solid";

interface TabsProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: string;
}

export default function Tabs({ activeTab, setActiveTab, theme }: TabsProps) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-3 border-b ${
        theme === "dark" ? "border-gray-700" : "border-gray-200"
      }`}
    >
      <div className="flex space-x-1">
        <button
          onClick={() => setActiveTab("main")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            activeTab === "main"
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
              : theme === "dark"
                ? "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
            activeTab === "settings"
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
              : theme === "dark"
                ? "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          }`}
        >
          <CogIcon className="w-4 h-4" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
} 