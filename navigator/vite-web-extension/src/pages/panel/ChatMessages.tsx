import { useRef, useEffect } from "react";
import { SparklesIcon } from "@heroicons/react/24/solid";
import type { Message } from "../../types";
import ChainOfThoughtMessage from "./ChainOfThoughtMessage";

interface ChatMessagesProps {
  messages: Message[];
  isProcessing: boolean;
  mode: string;
  theme: string;
}

export default function ChatMessages({ messages, isProcessing, mode, theme }: ChatMessagesProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  console.log("Chat Messages", messages)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
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
          {msg.type === "cot" ? (
            <ChainOfThoughtMessage cot={msg.cot} theme={theme} />
          ) : (
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
          )}
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
  );
} 