import { SparklesIcon } from "@heroicons/react/24/solid";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";

interface HeaderProps {
  theme: string;
  toggleTheme: () => void;
}

export default function Header({ theme, toggleTheme }: HeaderProps) {
  return (
    <div
      className={`flex items-center justify-between px-6 py-4 border-b backdrop-blur-sm ${
        theme === "dark" ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-white/50"
      }`}
    >
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
          <SparklesIcon className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
          Navigator AI
        </h1>
      </div>

      <button
        onClick={toggleTheme}
        className={`p-2 rounded-lg transition-all duration-200 ${
          theme === "dark"
            ? "bg-gray-700 hover:bg-gray-600 text-yellow-400"
            : "bg-gray-100 hover:bg-gray-200 text-gray-600"
        }`}
      >
        {theme === "dark" ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
      </button>
    </div>
  );
} 