import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon } from "@heroicons/react/24/solid"
import type { ChainOfThought, CoTStep } from "../../types"

interface ChainOfThoughtMessageProps {
  cot: ChainOfThought
  theme: string
}

const Step = ({ step, theme }: { step: CoTStep; theme: string }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="ml-4 mt-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center w-full text-left focus:outline-none"
      >
        {isExpanded ? (
          <ChevronDownIcon className="w-4 h-4 mr-2 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-4 h-4 mr-2 flex-shrink-0" />
        )}
        <span className="font-semibold">{step.title}</span>
      </button>
      {isExpanded && (
        <p className={`mt-1 pl-6 text-sm ${theme === "dark" ? "text-gray-400" : "text-gray-600"}`}>
          {step.description}
        </p>
      )}
    </div>
  )
}

export default function ChainOfThoughtMessage({ cot, theme }: ChainOfThoughtMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  console.log("Chain of Thought Message", cot)

  return (
    <div
      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
        theme === "dark"
          ? "bg-gray-800 text-gray-200 border border-gray-700"
          : "bg-gray-100 text-gray-800 border border-gray-200"
      }`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center w-full text-left focus:outline-none"
      >
        {isExpanded ? (
          <ChevronDownIcon className="w-5 h-5 mr-2 flex-shrink-0" />
        ) : (
          <ChevronRightIcon className="w-5 h-5 mr-2 flex-shrink-0" />
        )}
        <span className="font-bold">{cot.title}</span>
      </button>
      {isExpanded && (
        <div className="mt-2">
          {cot.steps.map((step, index) => (
            <Step key={index} step={step} theme={theme} />
          ))}
        </div>
      )}
    </div>
  )
} 