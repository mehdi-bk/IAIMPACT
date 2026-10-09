"use client"
import { create } from "zustand"
import type { AppContext, AppPage, AssistantCard, Highlight } from "./types"

export interface ToolChip {
  id: string
  name: string
  label: string
  status: "running" | "ok" | "error"
  code?: string
}

export interface UIMessage {
  id: string
  role: "user" | "assistant"
  text: string
  cards: AssistantCard[]
  tools: ToolChip[]
  status: "streaming" | "done" | "error"
  via?: "text" | "voice"
  error?: { message: string; retryable: boolean; retryInput?: string }
  /** Hidden system-event turns (e.g. action confirmed) render no user bubble. */
  hidden?: boolean
}

export type SheetMode = "closed" | "open" | "peek"

export interface WorkflowView {
  intent: string
  stage: string
  missingInformation: string[]
  pendingActionId: string | null
  sensitive: boolean
  authenticated: boolean
}

interface CompassState {
  sheet: SheetMode
  voice: boolean
  messages: UIMessage[]
  conversationId: string | null
  busy: boolean
  workflow: WorkflowView | null
  context: AppContext
  highlight: { target: Highlight; nonce: number } | null
  navigate: ((href: string) => void) | null
  stepUp: { actionId: string; title: string; resolve: (ok: boolean) => void } | null
  setSheet: (m: SheetMode) => void
  setVoice: (v: boolean) => void
  setContext: (c: Partial<AppContext>) => void
  setHighlight: (h: Highlight | null) => void
  resetConversation: () => void
}

export const useCompass = create<CompassState>((set) => ({
  sheet: "closed",
  voice: false,
  messages: [],
  conversationId: null,
  busy: false,
  workflow: null,
  context: { page: "accueil" as AppPage },
  highlight: null,
  navigate: null,
  stepUp: null,
  setSheet: (sheet) => set({ sheet }),
  setVoice: (voice) => set({ voice }),
  setContext: (c) => set((s) => ({ context: { ...s.context, ...c } })),
  setHighlight: (h) => set({ highlight: h ? { target: h, nonce: Date.now() } : null }),
  resetConversation: () => set({ messages: [], conversationId: null, workflow: null }),
}))

export const uid = () => Math.random().toString(36).slice(2, 10)

/** Opens the in-app simulated strong-authentication dialog and waits for the user. */
export function requestStepUp(actionId: string, title: string): Promise<boolean> {
  return new Promise((resolve) => useCompass.setState({ stepUp: { actionId, title, resolve } }))
}
