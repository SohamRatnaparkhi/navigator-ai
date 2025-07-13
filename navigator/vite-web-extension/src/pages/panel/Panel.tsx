import type React from "react"
import { useState, useEffect, useRef, Fragment } from "react"
import { Listbox, Transition } from "@headlessui/react"
import {
  SparklesIcon,
  ChevronDownIcon,
  MicrophoneIcon,
  PaperAirplaneIcon,
  StopIcon,
  CogIcon,
  PlusIcon,
  CheckIcon,
} from "@heroicons/react/24/solid"
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline"
import { getFullDOM } from "@src/utils/dom"

const llms = [
  { id: 1, name: "Gemini 2.5 Pro", unavailable: false },
  { id: 2, name: "GPT-4o", unavailable: false },
  { id: 3, name: "Claude Sonnet", unavailable: true },
]

export default function Panel() {
  const [activeTab, setActiveTab] = useState("main")
  const [theme, setTheme] = useState("dark")
  const [serverUrl, setServerUrl] = useState("http://localhost:8000")
  const [mode, setMode] = useState("agent")
  const [query, setQuery] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [messages, setMessages] = useState<{ type: string; text: string }[]>([])
  const [selectedLlm, setSelectedLlm] = useState(llms[0])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Simulate chrome storage for demo
    const savedTheme = localStorage.getItem("theme") || "dark"
    const savedServerUrl = localStorage.getItem("serverUrl") || "http://localhost:8000"
    setTheme(savedTheme)
    setServerUrl(savedServerUrl)
  }, [])

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    localStorage.setItem("theme", theme)
  }, [theme])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const updateServerUrl = (url: string) => {
    setServerUrl(url)
    localStorage.setItem("serverUrl", url)
  }

  const handleNewAgent = () => {
    setMessages([])
    setIsProcessing(false)
  }

  const simulateAgent = async () => {
    let count = 0
    const maxIterations = 3

    while (isProcessing && count < maxIterations) {
      await new Promise((res) => setTimeout(res, 1500))
      setMessages((msgs) => [
        ...msgs,
        {
          type: "agent",
          text: `Step ${count + 1}: Analyzing page structure and identifying interactive elements...`,
        },
      ])

      await new Promise((res) => setTimeout(res, 1000))
      setMessages((msgs) => [
        ...msgs,
        {
          type: "agent",
          text: `Step ${count + 1}: Executing automated actions based on your request...`,
        },
      ])

      count++
    }

    setIsProcessing(false)
    setMessages((msgs) => [
      ...msgs,
      {
        type: "agent",
        text: `✅ Task completed successfully! Performed ${count} automated actions.`,
      },
    ])
  }

  const simulateAsk = async (q: string) => {
    await new Promise((res) => setTimeout(res, 1000))
    setMessages((msgs) => [
      ...msgs,
      {
        type: "agent",
        text: `🔍 Analyzing current page content to answer: "${q}"`,
      },
    ])

    await new Promise((res) => setTimeout(res, 1500))
    setMessages((msgs) => [
      ...msgs,
      {
        type: "agent",
        text: `Based on the current page, here's what I found: This appears to be a web application interface. I can help you navigate, extract information, or perform actions on this page.`,
      },
    ])

    setIsProcessing(false)
  }

  const handleQuerySubmit = async () => {
    if (!query.trim()) return

    if (isProcessing) {
      setIsProcessing(false)
      return
    }

    setIsProcessing(true)
    setMessages([...messages, { type: "user", text: query }])
    const currentQuery = query
    setQuery("")

    if (mode === "agent") {
      simulateAgent()
    } else {
      simulateAsk(currentQuery)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleQuerySubmit()
    }
  }

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  return (
    <div
      className={`flex flex-col h-screen font-sans transition-colors duration-200 ${
        theme === "dark" ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"
      }`}
    >
      {/* Header */}
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

      {/* Tabs */}
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

      {activeTab === "main" ? (
        <>
          {/* Mode Selector */}
          <div
            className={`flex items-center justify-between px-6 py-4 border-b ${
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
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
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
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
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
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
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

          {/* Messages */}
          <main className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    theme === "dark" ? "bg-gray-800" : "bg-gray-100"
                  }`}
                >
                  <SparklesIcon className="w-8 h-8 text-blue-500" />
                </div>
                <div>
                  <h3 className={`text-lg font-semibold ${theme === "dark" ? "text-gray-200" : "text-gray-800"}`}>
                    Welcome to Navigator AI
                  </h3>
                  <p className={`text-sm mt-1 ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
                    {mode === "agent"
                      ? "Tell me what you want to do on this page, and I'll help you navigate it."
                      : "Ask me anything about the current page content."}
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex animate-fade-in ${msg.type === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    msg.type === "user"
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-500/25"
                      : theme === "dark"
                        ? "bg-gray-800 text-gray-200 border border-gray-700"
                        : "bg-gray-100 text-gray-800 border border-gray-200"
                  }`}
                >
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                </div>
              </div>
            ))}

            {isProcessing && (
              <div className="flex justify-start">
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    theme === "dark"
                      ? "bg-gray-800 text-gray-200 border border-gray-700"
                      : "bg-gray-100 text-gray-800 border border-gray-200"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      ></div>
                      <div
                        className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      ></div>
                    </div>
                    <span className="text-sm">Processing...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </main>

          {/* Input Area */}
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
        </>
      ) : (
        /* Settings Tab */
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
      )}
    </div>
  )
}
