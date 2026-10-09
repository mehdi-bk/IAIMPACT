"use client"
import { api, refresh, type RefreshKey } from "./api"
import { requestStepUp, uid, useCompass, type UIMessage } from "./store"
import { APP_PAGES, type AssistantCard, type PendingAction, type UiDirective } from "./types"

// Client side of the conversation contract: posts to /api/chat and applies the
// structured events (text deltas, tool status, cards, UI directives).

type ChatInput = { message: string } | { event: { type: "action_result"; actionId: string } | { type: "handoff_result"; handoffId: string } }

function patchMessage(id: string, fn: (m: UIMessage) => UIMessage) {
  useCompass.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }))
}

/** Voice mode registers itself here so confirmations made by touch are spoken back. */
export const voiceBridge: { onActionResult?: (a: PendingAction) => void; onHandoffResult?: (status: string) => void } = {}

export function applyDirective(d: UiDirective) {
  const st = useCompass.getState()
  if (d.type === "refresh") {
    refresh(d.keys as RefreshKey[])
    return
  }
  const params = new URLSearchParams()
  if (d.transactionId) params.set("tx", d.transactionId)
  if (d.cardId) params.set("card", d.cardId)
  const href = `${APP_PAGES[d.page]}${params.size ? `?${params}` : ""}`
  st.navigate?.(href)
  if (d.highlight) setTimeout(() => useCompass.getState().setHighlight(d.highlight!), 350)
  // Let the customer SEE the application respond: tuck the assistant away.
  setTimeout(() => {
    const s = useCompass.getState()
    if (s.sheet === "open") s.setSheet("peek")
  }, 650)
}

/** Resolves when the current turn has finished (events such as a confirmation are queued, never dropped). */
function waitIdle(timeoutMs = 60_000): Promise<boolean> {
  if (!useCompass.getState().busy) return Promise.resolve(true)
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      unsub()
      resolve(false)
    }, timeoutMs)
    const unsub = useCompass.subscribe((s) => {
      if (!s.busy) {
        clearTimeout(t)
        unsub()
        resolve(true)
      }
    })
  })
}

export async function sendToCompass(input: ChatInput, opts: { hidden?: boolean } = {}) {
  if (useCompass.getState().busy) {
    if ("message" in input) return // the composer is disabled while busy
    if (!(await waitIdle())) return
  }
  const st = useCompass.getState()
  const userId = uid()
  const asstId = uid()
  const isMessage = "message" in input
  const newMsgs: UIMessage[] = []
  if (isMessage && !opts.hidden) {
    newMsgs.push({ id: userId, role: "user", text: input.message, cards: [], tools: [], status: "done", via: "text" })
  }
  newMsgs.push({ id: asstId, role: "assistant", text: "", cards: [], tools: [], status: "streaming" })
  useCompass.setState((s) => ({ messages: [...s.messages, ...newMsgs], busy: true, sheet: s.sheet === "closed" ? "open" : s.sheet }))

  const fail = (message: string, retryable: boolean) =>
    patchMessage(asstId, (m) => ({ ...m, status: "error", error: { message, retryable, retryInput: isMessage ? input.message : undefined } }))

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: st.conversationId, input, context: st.context }),
    })
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null)
      fail(data?.error?.message ?? "Compass est momentanément indisponible. Vous pouvez réessayer.", true)
      return
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let finished = false
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (!chunk.startsWith("data: ")) continue
        const ev = JSON.parse(chunk.slice(6))
        switch (ev.type) {
          case "conversation":
            useCompass.setState({ conversationId: ev.id })
            break
          case "text":
            patchMessage(asstId, (m) => ({ ...m, text: m.text + ev.delta }))
            break
          case "text_break":
            patchMessage(asstId, (m) => ({ ...m, text: m.text && !m.text.endsWith("\n\n") ? `${m.text}\n\n` : m.text }))
            break
          case "tool_start":
            if (ev.name === "suggest_actions") break
            patchMessage(asstId, (m) => ({ ...m, tools: [...m.tools, { id: ev.id, name: ev.name, label: ev.label, status: "running" }] }))
            break
          case "tool_end":
            patchMessage(asstId, (m) => ({
              ...m,
              tools: m.tools.map((t) => (t.id === ev.id ? { ...t, status: ev.ok ? "ok" : "error", code: ev.code } : t)),
            }))
            if (ev.ok && /^(prepare_|cancel_)/.test(ev.name)) refresh(["cards", "accounts"])
            break
          case "card":
            patchMessage(asstId, (m) => ({ ...m, cards: mergeCard(m.cards, ev.card) }))
            break
          case "ui":
            applyDirective(ev.directive)
            break
          case "workflow":
            useCompass.setState({ workflow: ev.workflow })
            break
          case "error":
            fail(ev.message, ev.retryable)
            finished = true
            break
          case "done":
            finished = true
            break
        }
      }
    }
    if (!finished) fail("La connexion a été interrompue. Vous pouvez réessayer.", true)
    else patchMessage(asstId, (m) => (m.status === "error" ? m : { ...m, status: "done", text: m.text.trim() }))
  } catch {
    fail("Impossible de joindre Compass. Vérifiez votre connexion et réessayez.", true)
  } finally {
    useCompass.setState({ busy: false })
    refresh(["cards", "accounts", "transactions", "handoffs", "session"])
  }
}

// Options cards replace each other; a confirmation card updates in place.
function mergeCard(cards: AssistantCard[], card: AssistantCard): AssistantCard[] {
  if (card.kind === "confirmation") {
    const i = cards.findIndex((c) => c.kind === "confirmation" && c.action.id === card.action.id)
    if (i >= 0) return cards.map((c, j) => (j === i ? card : c))
  }
  if (card.kind === "options") return [...cards.filter((c) => c.kind !== "options"), card]
  return [...cards, card]
}

/** Updates every rendered copy of an action card (chat + voice) after a state change. */
export function updateActionEverywhere(action: PendingAction) {
  useCompass.setState((s) => ({
    messages: s.messages.map((m) => ({
      ...m,
      cards: m.cards.map((c) => (c.kind === "confirmation" && c.action.id === action.id ? { ...c, action } : c)),
    })),
  }))
}

/**
 * Explicit user confirmation (button). Runs the simulated step-up when the
 * backend requires it, then lets the server execute. Never called by the AI.
 */
export async function confirmPendingAction(action: PendingAction): Promise<PendingAction> {
  let stepUp = false
  if (action.requiresStepUp) {
    stepUp = await requestStepUp(action.id, action.title)
    if (!stepUp) throw new Error("STEP_UP_CANCELLED")
  }
  const { action: done } = await api<{ action: PendingAction }>("/api/actions", { method: "POST", json: { op: "confirm", actionId: action.id, stepUp } })
  updateActionEverywhere(done)
  await refresh(["cards", "accounts", "transactions"])
  return done
}

export async function cancelPendingAction(action: PendingAction): Promise<PendingAction> {
  const { action: done } = await api<{ action: PendingAction }>("/api/actions", { method: "POST", json: { op: "cancel", actionId: action.id } })
  updateActionEverywhere(done)
  return done
}

/** Opens Compass with a message already sent (used by "Demander à Compass" buttons). */
export function askCompass(message: string) {
  useCompass.getState().setSheet("open")
  void sendToCompass({ message })
}
