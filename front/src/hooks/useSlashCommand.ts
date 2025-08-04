import { useState, useEffect, RefObject } from "react"
import type React from "react"
import ISO6391 from 'iso-639-1';

export interface SlashCommand {
  command: string
  description: string
  parameters: string[]
  template: string
}


export const SLASH_COMMANDS: SlashCommand[] = [
  {
    command: "/query",
    description: "Find your infos",
    parameters: ["key"],
    template: "/query {key}",
  },
  {
    command: "/update",
    description: "Update your infos",
    parameters: ["key", "value"],
    template: "/update {key} {value}",
  },
  {
    command: "/translate",
    description: "Translate current form",
    parameters: ["lang"],
    template: "/translate {lang}",
  },
]

const KEYWORDS_COMPLETIONS = [
  "/query",
  "/update", 
  "/translate"
]

// ──────────────────────────────────────────────────────────────────
// Helper: basic fuzzy match (characters in order, not necessarily contiguous)
// ──────────────────────────────────────────────────────────────────
const fuzzyMatch = (query: string, target: string): boolean => {
  if (!query) return true
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++
    }
  }
  return qi === q.length
}

type CommandSuggestion = {
  type: "command"
  value: string
  description: string
  command: SlashCommand
}

type ParameterSuggestion = {
  type: "parameter"
  value: string
  paramType: "key" | "lang" | "value"
}

export type Suggestion =
  CommandSuggestion |
  ParameterSuggestion

/**
 * Hook that manages the input value and the slash-command / parameter
 * auto-completion behaviour used by the HandInput component.
 */
export function useSlashCommand(
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement>, contextKeys: string[]) {
  /** Current value typed by the user */
  const [currentInput, setCurrentInput] = useState<string>("")

  /** Auto-completion state */
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState(0)
  const [currentCommand, setCurrentCommand] = useState<SlashCommand | null>(null)
  const [parameterIndex, setParameterIndex] = useState(0)

  /* ──────────────────────────────────────────────────────────────────
   * Suggestion helpers
   * ─────────────────────────────────────────────────────────────────*/
  const generateCommandWParams = (command: SlashCommand, params: string[]): string => {
    let commandWParams = command.template
    command.parameters.forEach((param, index) => {
      if (params[index]) {
        commandWParams = commandWParams.replace(`{${param}}`, params[index])
      }
    })
    return commandWParams
  }

  const updateSuggestions = (value: string) => {
    if (!value.startsWith("/")) {
      setShowSuggestions(false)
      setCurrentCommand(null)
      setParameterIndex(0)
      return
    }

    const parts = value.split(" ")
    const commandPart = parts[0]

    // 1. Command suggestions (user still typing the command)
    if (parts.length === 1) {
      const matchingCommands = SLASH_COMMANDS.filter((cmd) =>
        fuzzyMatch(commandPart.toLowerCase(), cmd.command)
      )
      setSuggestions(
        matchingCommands.map(
          (cmd) => (
            {
              type: "command",
              value: cmd.command,
              description: cmd.description,
              command: cmd,
            }))
      )
      setShowSuggestions(matchingCommands.length > 0)
      setCurrentCommand(null)
      setParameterIndex(0)
    } else {
      // 2. Parameter suggestions (command is chosen, fill its params)
      const command = SLASH_COMMANDS.find((cmd) => cmd.command === commandPart.toLowerCase())
      if (command) {
        setCurrentCommand(command)
        const currentParamIndex = parts.length - 2 // -1 for command, -1 for 0-based index
        setParameterIndex(currentParamIndex)

        if (currentParamIndex < command.parameters.length) {
          const paramType = command.parameters[currentParamIndex]
          const currentParamValue = parts[parts.length - 1] || ""

          let paramSuggestions: string[] = []
          if (paramType === "key") {
            paramSuggestions = contextKeys.filter((key) =>
              fuzzyMatch(currentParamValue, key)
            )
            // For /update command, include the current typed value as a suggestion (upsert operation)
            if (command.command === "/update" && currentParamValue && !paramSuggestions.includes(currentParamValue)) {
              paramSuggestions.unshift(currentParamValue)
            }
          } else if (paramType.includes("lang")) {
            paramSuggestions = ISO6391.getAllNames().filter((lang) =>
              fuzzyMatch(currentParamValue, lang)
            )
          }

          setSuggestions(
            paramSuggestions.map((param) => ({
              type: "parameter",
              value: param,
              paramType: paramType as "key" | "value" | "lang",
            }))
          )
          setShowSuggestions(paramSuggestions.length > 0)
        } else {
          setShowSuggestions(false)
        }
      } else {
        setShowSuggestions(false)
        setCurrentCommand(null)
        setParameterIndex(0)
      }
    }
    setSelectedSuggestion(0)
  }

  const applySuggestion = (suggestion: any) => {
    if (suggestion.type === "command") {
      const newValue = suggestion.value + " "
      setCurrentInput(newValue)
      setCurrentCommand(suggestion.command)
      setParameterIndex(0)
      setShowSuggestions(false)

      // Trigger parameter suggestions after a tick so the input value is updated first
      setTimeout(() => {
        updateSuggestions(newValue)
        inputRef.current?.focus()
      }, 50)
    } else if (suggestion.type === "parameter") {
      const parts = currentInput.split(" ")
      parts[parts.length - 1] = suggestion.value
      const newValue = parts.join(" ")

      if (currentCommand && parameterIndex + 1 < currentCommand.parameters.length) {
        const nextValue = newValue + " "
        setCurrentInput(nextValue)
        setShowSuggestions(false)
        setTimeout(() => updateSuggestions(nextValue), 50)
      } else if (currentCommand) {
        const finalCommand = generateCommandWParams(currentCommand, parts.slice(1))
        setCurrentInput(finalCommand)
        setShowSuggestions(false)
        setCurrentCommand(null)
        setParameterIndex(0)
      }
    }
  }

  /* ──────────────────────────────────────────────────────────────────
   * Keyboard / input handlers (exported)
   * ─────────────────────────────────────────────────────────────────*/
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setSelectedSuggestion((prev) => (prev + 1) % suggestions.length)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setSelectedSuggestion((prev) => (prev - 1 + suggestions.length) % suggestions.length)
      } else if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault()
        applySuggestion(suggestions[selectedSuggestion])
        return
      } else if (e.key === "Escape") {
        setShowSuggestions(false)
      }
    }

    // Legacy keyword completions when no suggestions visible
    if (e.key === "Tab" && !showSuggestions) {
      e.preventDefault()
      const prefix = currentInput.trim().toLowerCase()
      if (!prefix) return
      const matches = KEYWORDS_COMPLETIONS.filter((k) => fuzzyMatch(prefix, k))
      if (matches.length > 0) {
        setCurrentInput(matches[0])
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value
    setCurrentInput(value)
    updateSuggestions(value)
  }

  /* ──────────────────────────────────────────────────────────────────
   * Hide suggestions when clicking outside input
   * ─────────────────────────────────────────────────────────────────*/
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [inputRef])

  /* ─────────────────────────────────────────────────────────────────*/
  return {
    currentInput,
    setCurrentInput,
    showSuggestions,
    suggestions,
    selectedSuggestion,
    currentCommand,
    parameterIndex,
    handleKeyDown,
    handleInputChange,
    applySuggestion,
  }
} 
