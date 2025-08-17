import React, { Fragment } from "react";
import { Listbox, Transition } from "@headlessui/react";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/solid";

interface SettingsProps {
  selectedLlm: { id: number; name: string; unavailable: boolean };
  setSelectedLlm: (llm: { id: number; name: string; unavailable: boolean }) => void;
  serverUrl: string;
  updateServerUrl: (url: string) => void;
  theme: string;
  llms: { id: number; name: string; unavailable: boolean }[];
  debugMode: boolean;
  setDebugMode: (debugMode: boolean) => void;
}

export default function Settings({
  selectedLlm,
  setSelectedLlm,
  serverUrl,
  updateServerUrl,
  theme,
  llms,
  debugMode,
  setDebugMode,
}: SettingsProps) {
  return (
    <div className="flex-1 p-6 space-y-8">
      <div className="space-y-6">
        <div>
          <h3 className={`text-lg font-semibold mb-4 ${theme === "dark" ? "text-gray-200" : "text-gray-800"}`}>
            AI Model Configuration
          </h3>

          <div className="space-y-4">
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
              >
                Language Model
              </label>
              <Listbox value={selectedLlm} onChange={setSelectedLlm}>
                <div className="relative">
                  <Listbox.Button
                    className={`relative w-full cursor-pointer rounded-xl py-3 pl-4 pr-10 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      theme === "dark"
                        ? "bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-750"
                        : "bg-gray-50 text-gray-900 border border-gray-200 hover:bg-gray-100"
                    }`}
                  >
                    <span className="flex items-center">
                      <span className="block truncate font-medium">{selectedLlm.name}</span>
                      {selectedLlm.unavailable && (
                        <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-200">
                          Unavailable
                        </span>
                      )}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    </span>
                  </Listbox.Button>
                  <Transition
                    as={Fragment}
                    leave="transition ease-in duration-100"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <Listbox.Options
                      className={`absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-xl py-2 shadow-xl ring-1 ring-black/5 focus:outline-none ${
                        theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-white border border-gray-200"
                      }`}
                    >
                      {llms.map((llm) => (
                        <Listbox.Option
                          key={llm.id}
                          className={({ active, selected }) =>
                            `relative cursor-pointer select-none py-3 px-4 transition-colors duration-150 ${
                              active ? (theme === "dark" ? "bg-gray-700" : "bg-gray-100") : ""
                            } ${llm.unavailable ? "opacity-50 cursor-not-allowed" : ""}`
                          }
                          value={llm}
                          disabled={llm.unavailable}
                        >
                          {({ selected }: { selected: boolean }) => (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <span
                                  className={`block truncate ${selected ? "font-semibold" : "font-normal"} ${
                                    theme === "dark" ? "text-gray-200" : "text-gray-900"
                                  }`}
                                >
                                  {llm.name}
                                </span>
                                {llm.unavailable && (
                                  <span className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full dark:bg-red-900 dark:text-red-200">
                                    Unavailable
                                  </span>
                                )}
                              </div>
                              {selected && <CheckIcon className="h-5 w-5 text-blue-500" />}
                            </div>
                          )}
                        </Listbox.Option>
                      ))}
                    </Listbox.Options>
                  </Transition>
                </div>
              </Listbox>
            </div>

            <div>
              <label
                className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
              >
                Server URL
              </label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => updateServerUrl(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  theme === "dark"
                    ? "bg-gray-800 text-gray-200 border border-gray-700 placeholder-gray-400"
                    : "bg-gray-50 text-gray-900 border border-gray-200 placeholder-gray-500"
                }`}
                placeholder="http://localhost:8000"
              />
              <p className={`mt-2 text-xs ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                The backend server URL for AI model communication
              </p>
            </div>
            <div>
              <label
                className={`block text-sm font-medium mb-2 ${theme === "dark" ? "text-gray-300" : "text-gray-700"}`}
              >
                Debug Mode
              </label>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className={`text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    Show visual overlays and element IDs on web pages
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newDebugMode = !debugMode;
                    setDebugMode(newDebugMode);
                    chrome.storage.local.set({ debugMode: newDebugMode });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    debugMode 
                      ? "bg-blue-600" 
                      : theme === "dark" 
                        ? "bg-gray-700" 
                        : "bg-gray-200"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out ${
                      debugMode ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className={`pt-6 border-t ${theme === "dark" ? "border-gray-700" : "border-gray-200"}`}>
          <h3 className={`text-lg font-semibold mb-4 ${theme === "dark" ? "text-gray-200" : "text-gray-800"}`}>
            About
          </h3>
          <div
            className={`p-4 rounded-xl ${
              theme === "dark" ? "bg-gray-800 border border-gray-700" : "bg-gray-50 border border-gray-200"
            }`}
          >
            <p className={`text-sm ${theme === "dark" ? "text-gray-300" : "text-gray-600"}`}>
              Navigator AI helps you interact with web pages through natural language. Use Agent mode for automated
              actions or Ask mode for page analysis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
} 