import type React from "react"
import { useState, useEffect, useRef } from "react"
import Header from "./Header"
import Tabs from "./Tabs"
import ModeSelector from "./ModeSelector"
import ChatMessages from "./ChatMessages"
import InputArea from "./InputArea"
import Settings from "./Settings"

import { collectDOMData } from "../../utils/dom"
import { createTask, updateTaskDom } from "../../utils/api"
import type { Message } from "../../types"

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
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedLlm, setSelectedLlm] = useState(llms[0])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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

    // Allow stopping the current processing if user submits while processing
    if (isProcessing) {
      setIsProcessing(false)
      return
    }

    const currentQuery = query.trim()
    setMessages((prev) => [...prev, { type: "user", text: currentQuery }])
    setQuery("")
    setIsProcessing(true)
    
    const url = window.location.href
    const tabs = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    })
    const currentTab = tabs[0]
    const openTabsWithIds = tabs.map((tab) => `${tab.id}`)

    if (mode === "agent") {
      try {
        const domData = await collectDOMData()

        const { task_id, chain_of_thought = null } = await createTask(serverUrl, currentQuery, url, openTabsWithIds, `${currentTab.id}`)

        const taskMessage: Message = { type: "agent", text: `🆕 Task created with ID: ${task_id}` }
        const cotMessages: Message[] = chain_of_thought
          ? [{ type: "cot", cot: chain_of_thought }]
          : []
        setMessages((prev) => [...prev, taskMessage, ...cotMessages])

        await updateTaskDom(serverUrl, {
          task_id,
          dom_data: domData,
          iterationNumber: 0,
          openTabsWithIds: [],
          currentTab: null,
        })

        setMessages((prev) => [
          ...prev,
          { type: "agent", text: `🌐 DOM snapshot sent for task ${task_id}.` },
        ])
      } catch (err: any) {
        const errorMsg = err?.message || "An unexpected error occurred."
        setMessages((prev) => [...prev, { type: "agent", text: `❌ ${errorMsg}` }])
      } finally {
        setIsProcessing(false)
      }
    } else {
      // Handle "ask" mode
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
      <Header theme={theme} toggleTheme={toggleTheme} />
      <Tabs activeTab={activeTab} setActiveTab={setActiveTab} theme={theme} />

      {activeTab === "main" ? (
        <>
          <ModeSelector mode={mode} setMode={setMode} handleNewAgent={handleNewAgent} theme={theme} />
          <ChatMessages messages={messages} isProcessing={isProcessing} mode={mode} theme={theme} />
          <InputArea
            query={query}
            setQuery={setQuery}
            handleQuerySubmit={handleQuerySubmit}
            handleKeyDown={handleKeyDown}
            isProcessing={isProcessing}
            mode={mode}
            theme={theme}
          />
        </>
      ) : (
        <Settings
          selectedLlm={selectedLlm}
          setSelectedLlm={setSelectedLlm}
          serverUrl={serverUrl}
          updateServerUrl={updateServerUrl}
          theme={theme}
          llms={llms}
        />
      )}
    </div>
  )
}
